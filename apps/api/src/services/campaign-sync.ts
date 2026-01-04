import { db } from "../lib/db.js"
import { sourceAccounts, campaignSyncs } from "../db/schema.js"
import { getAuthenticatedSource } from "../traffic-sources/index.js"
import { eq, and } from "drizzle-orm"
import { logger } from "../lib/logger.js"

const SYNC_DELAY_MS = 2000 // 2 second delay between accounts to avoid rate limits

interface SyncResult {
  synced: number
  failed: number
  details: Array<{ accountId: string; success: boolean; error?: string; campaignCount?: number }>
}

export class CampaignSyncService {
  /**
   * Sync campaigns for all active source accounts
   * Continues processing even if individual accounts fail
   */
  async syncAll(): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, failed: 0, details: [] }

    // Get all connected source accounts
    const accounts = await db
      .select()
      .from(sourceAccounts)
      .where(eq(sourceAccounts.status, "connected"))

    logger.info(`Starting campaign sync for ${accounts.length} accounts`)

    for (const account of accounts) {
      try {
        const campaignCount = await this.syncAccount(account.id)
        result.synced++
        result.details.push({
          accountId: account.id,
          success: true,
          campaignCount,
        })
        logger.info(`Synced ${campaignCount} campaigns for account ${account.id}`)
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

    logger.info(`Campaign sync complete: ${result.synced} succeeded, ${result.failed} failed`)
    return result
  }

  /**
   * Sync campaigns for a single source account
   * Returns the number of campaigns synced
   */
  async syncAccount(accountId: string): Promise<number> {
    // Get authenticated traffic source adapter
    const source = await getAuthenticatedSource(accountId)

    // Fetch campaigns from external API
    const campaigns = await source.getCampaigns({ status: "all" })

    // Upsert each campaign
    for (const campaign of campaigns) {
      const budgetValue = campaign.budget === "unlimited" ? null : campaign.budget?.toString() ?? null

      await db
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
            syncedAt: new Date(),
          },
        })
    }

    // Update lastSyncAt on source account
    await db
      .update(sourceAccounts)
      .set({
        lastSyncAt: new Date(),
        lastError: null, // Clear any previous error on success
      })
      .where(eq(sourceAccounts.id, accountId))

    return campaigns.length
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// Singleton instance
export const campaignSyncService = new CampaignSyncService()
