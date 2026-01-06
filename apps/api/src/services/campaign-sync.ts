import { db } from "../lib/db.js"
import { sourceAccounts, campaignSyncs, type SyncStatus, type SyncTrigger } from "../db/schema.js"
import { getAuthenticatedSource } from "../traffic-sources/index.js"
import { eq } from "drizzle-orm"
import { logger } from "../lib/logger.js"
import { SyncMetricsService } from "./sync-metrics.js"

const SYNC_DELAY_MS = 2000 // 2 second delay between accounts to avoid rate limits

interface SyncResult {
  synced: number
  failed: number
  syncRunId?: string
  details: Array<{ accountId: string; success: boolean; error?: string; campaignCount?: number; widgetCount?: number }>
}

export class CampaignSyncService {
  private metricsService: SyncMetricsService

  constructor() {
    this.metricsService = new SyncMetricsService(db)
  }

  /**
   * Sync campaigns for all active source accounts
   * Continues processing even if individual accounts fail
   */
  async syncAll(triggeredBy: SyncTrigger = 'scheduled'): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, failed: 0, details: [] }

    // Start sync run for audit logging
    const syncRunId = await this.metricsService.startSyncRun(null, triggeredBy)
    result.syncRunId = syncRunId

    // Get all connected source accounts
    const accounts = await db
      .select()
      .from(sourceAccounts)
      .where(eq(sourceAccounts.status, "connected"))

    logger.info(`Starting campaign sync for ${accounts.length} accounts (run: ${syncRunId})`)
    let totalWidgets = 0

    try {
      for (const account of accounts) {
        try {
          const { campaignCount, widgetCount } = await this.syncAccountWithMetrics(account.id, syncRunId, triggeredBy)
          result.synced++
          totalWidgets += widgetCount
          result.details.push({
            accountId: account.id,
            success: true,
            campaignCount,
            widgetCount,
          })
          logger.info(`Synced ${campaignCount} campaigns, ${widgetCount} widgets for account ${account.id}`)
        } catch (error) {
          result.failed++
          const errorMessage = error instanceof Error ? error.message : "Unknown error"
          result.details.push({
            accountId: account.id,
            success: false,
            error: errorMessage,
          })
          logger.error(`Failed to sync account ${account.id}: ${errorMessage}`)

          // Update lastError on the source account
          await db
            .update(sourceAccounts)
            .set({ lastError: errorMessage })
            .where(eq(sourceAccounts.id, account.id))
        }

        // Delay between accounts to avoid rate limits
        if (accounts.indexOf(account) < accounts.length - 1) {
          await this.delay(SYNC_DELAY_MS)
        }
      }

      // Complete sync run
      await this.metricsService.completeSyncRun(syncRunId, {
        campaignsTotal: accounts.length,
        campaignsSynced: result.synced,
        campaignsFailed: result.failed,
        widgetsSynced: totalWidgets,
      })

      logger.info(`Campaign sync complete: ${result.synced} succeeded, ${result.failed} failed (run: ${syncRunId})`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      await this.metricsService.failSyncRun(syncRunId, errorMessage)
      throw error
    }

    return result
  }

  /**
   * Sync campaigns for a single source account with metrics tracking
   * Returns the number of campaigns and widgets synced
   */
  async syncAccountWithMetrics(
    accountId: string,
    syncRunId: string,
    triggeredBy: SyncTrigger = 'scheduled'
  ): Promise<{ campaignCount: number; widgetCount: number }> {
    // Get authenticated traffic source adapter
    const source = await getAuthenticatedSource(accountId)

    // Fetch campaigns from external API
    const campaigns = await source.getCampaigns({ status: "all" })
    let totalWidgets = 0

    // Upsert each campaign with state tracking
    for (const campaign of campaigns) {
      const campaignSyncId = await this.upsertCampaign(accountId, campaign, syncRunId)

      // Sync widget stats
      try {
        const widgets = await source.getWidgets({ campaignId: campaign.id })
        if (widgets && widgets.length > 0) {
          await this.metricsService.storeWidgetSnapshots(syncRunId, campaignSyncId, widgets.map(w => ({
            widgetId: w.id,
            widgetName: w.name,
            impressions: w.metrics.impressions,
            clicks: w.metrics.clicks,
            spend: w.metrics.spend.toString(),
            conversions: w.metrics.conversions,
            ctr: w.metrics.ctr.toString(),
            cpc: w.metrics.cpc?.toString(),
            cpa: w.metrics.cpa?.toString(),
            enabled: w.enabled,
          })))
          totalWidgets += widgets.length
        }
      } catch (error) {
        // Widget sync errors don't fail the campaign sync
        logger.warn(`Failed to sync widgets for campaign ${campaign.id}: ${error}`)
      }
    }

    // Update lastSyncAt on source account
    await db
      .update(sourceAccounts)
      .set({
        lastSyncAt: new Date(),
        lastError: null, // Clear any previous error on success
      })
      .where(eq(sourceAccounts.id, accountId))

    return { campaignCount: campaigns.length, widgetCount: totalWidgets }
  }

  /**
   * Sync a single campaign (for manual sync API)
   */
  async syncSingleCampaign(campaignSyncId: string, triggeredBy: SyncTrigger = 'manual'): Promise<void> {
    // Get campaign sync record
    const campaignSync = await db.query.campaignSyncs.findFirst({
      where: eq(campaignSyncs.id, campaignSyncId),
    })

    if (!campaignSync) {
      throw new Error(`Campaign sync ${campaignSyncId} not found`)
    }

    // Check if already syncing (state machine)
    if (campaignSync.syncStatus === 'syncing') {
      logger.info(`Campaign ${campaignSyncId} already syncing, skipping`)
      return
    }

    // Start sync run
    const syncRunId = await this.metricsService.startSyncRun(campaignSync.sourceAccountId, triggeredBy)

    try {
      // Update state to syncing
      await this.updateCampaignSyncState(campaignSyncId, 'syncing', syncRunId)

      // Get authenticated source
      const source = await getAuthenticatedSource(campaignSync.sourceAccountId)

      // Fetch single campaign data
      const campaigns = await source.getCampaigns({ status: "all" })
      const campaign = campaigns.find(c => c.id === campaignSync.externalCampaignId)

      if (!campaign) {
        throw new Error(`Campaign ${campaignSync.externalCampaignId} not found in source`)
      }

      // Update campaign data
      await this.upsertCampaign(campaignSync.sourceAccountId, campaign, syncRunId)

      // Sync widgets
      let widgetCount = 0
      try {
        const widgets = await source.getWidgets({ campaignId: campaign.id })
        if (widgets && widgets.length > 0) {
          await this.metricsService.storeWidgetSnapshots(syncRunId, campaignSyncId, widgets.map(w => ({
            widgetId: w.id,
            widgetName: w.name,
            impressions: w.metrics.impressions,
            clicks: w.metrics.clicks,
            spend: w.metrics.spend.toString(),
            conversions: w.metrics.conversions,
            ctr: w.metrics.ctr.toString(),
            cpc: w.metrics.cpc?.toString(),
            cpa: w.metrics.cpa?.toString(),
            enabled: w.enabled,
          })))
          widgetCount = widgets.length
        }
      } catch (error) {
        logger.warn(`Failed to sync widgets for single campaign ${campaign.id}: ${error}`)
      }

      // Update state to synced
      await this.updateCampaignSyncState(campaignSyncId, 'synced', syncRunId)

      // Complete sync run
      await this.metricsService.completeSyncRun(syncRunId, {
        campaignsTotal: 1,
        campaignsSynced: 1,
        campaignsFailed: 0,
        widgetsSynced: widgetCount,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"

      // Update state to error
      await this.updateCampaignSyncState(campaignSyncId, 'error', syncRunId, errorMessage)
      await this.metricsService.failSyncRun(syncRunId, errorMessage)

      throw error
    }
  }

  /**
   * Sync campaigns for a single account (for manual sync API)
   */
  async syncAccount(accountId: string, triggeredBy: SyncTrigger = 'scheduled'): Promise<number> {
    const syncRunId = await this.metricsService.startSyncRun(accountId, triggeredBy)

    try {
      const { campaignCount, widgetCount } = await this.syncAccountWithMetrics(accountId, syncRunId, triggeredBy)

      await this.metricsService.completeSyncRun(syncRunId, {
        campaignsTotal: campaignCount,
        campaignsSynced: campaignCount,
        campaignsFailed: 0,
        widgetsSynced: widgetCount,
      })

      return campaignCount
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      await this.metricsService.failSyncRun(syncRunId, errorMessage)
      throw error
    }
  }

  /**
   * Upsert campaign and return the campaign sync ID
   */
  private async upsertCampaign(
    accountId: string,
    campaign: {
      id: string
      name: string
      status: string
      enabled: boolean
      budget?: number | 'unlimited'
      bid: number
      metrics: {
        spend: number
        impressions: number
        clicks: number
        conversions: number
        ctr: number
        cpa: number
      }
    },
    syncRunId: string
  ): Promise<string> {
    const budgetValue = campaign.budget === "unlimited" ? null : campaign.budget?.toString() ?? null

    const [result] = await db
      .insert(campaignSyncs)
      .values({
        sourceAccountId: accountId,
        externalCampaignId: campaign.id,
        campaignName: campaign.name,
        status: campaign.status,
        enabled: campaign.enabled,
        budget: budgetValue,
        bid: campaign.bid.toString(),
        spend: campaign.metrics.spend.toString(),
        impressions: campaign.metrics.impressions,
        clicks: campaign.metrics.clicks,
        conversions: campaign.metrics.conversions,
        ctr: campaign.metrics.ctr.toString(),
        cpa: campaign.metrics.cpa.toString(),
        syncStatus: 'synced',
        lastSyncRunId: syncRunId,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [campaignSyncs.sourceAccountId, campaignSyncs.externalCampaignId],
        set: {
          campaignName: campaign.name,
          status: campaign.status,
          enabled: campaign.enabled,
          budget: budgetValue,
          bid: campaign.bid.toString(),
          spend: campaign.metrics.spend.toString(),
          impressions: campaign.metrics.impressions,
          clicks: campaign.metrics.clicks,
          conversions: campaign.metrics.conversions,
          ctr: campaign.metrics.ctr.toString(),
          cpa: campaign.metrics.cpa.toString(),
          syncStatus: 'synced',
          lastSyncRunId: syncRunId,
          syncedAt: new Date(),
        },
      })
      .returning({ id: campaignSyncs.id })

    return result.id
  }

  /**
   * Update campaign sync state (state machine)
   */
  private async updateCampaignSyncState(
    campaignSyncId: string,
    status: SyncStatus,
    syncRunId: string,
    error?: string
  ): Promise<void> {
    await db
      .update(campaignSyncs)
      .set({
        syncStatus: status,
        syncStartedAt: status === 'syncing' ? new Date() : undefined,
        syncError: error || null,
        lastSyncRunId: syncRunId,
      })
      .where(eq(campaignSyncs.id, campaignSyncId))
  }

  /**
   * Get metrics service for external access
   */
  getMetricsService(): SyncMetricsService {
    return this.metricsService
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// Singleton instance
export const campaignSyncService = new CampaignSyncService()
