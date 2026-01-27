import { eq, and, gte, lte, desc } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../db/schema.js'
import type {
  SyncRun,
  SyncTrigger,
  SyncRunStatus,
  CampaignSync,
  WidgetSync,
} from '../db/schema.js'

export interface SyncRunStats {
  campaignsTotal: number
  campaignsSynced: number
  campaignsFailed: number
  widgetsSynced: number
}

export interface SyncRunDetails extends SyncRun {
  campaigns: CampaignSync[]
}

/**
 * SyncMetricsService - Handles sync audit logging and metrics tracking
 */
export class SyncMetricsService {
  constructor(private db: PostgresJsDatabase<typeof schema>) {}

  /**
   * Start a new sync run - creates audit record
   */
  async startSyncRun(
    sourceAccountId: string | null,
    triggeredBy: SyncTrigger
  ): Promise<string> {
    const [run] = await this.db
      .insert(schema.syncRuns)
      .values({
        sourceAccountId,
        triggeredBy,
        status: 'running',
        startedAt: new Date(),
      })
      .returning({ id: schema.syncRuns.id })

    return run.id
  }

  /**
   * Complete a sync run with stats
   */
  async completeSyncRun(syncRunId: string, stats: SyncRunStats): Promise<void> {
    const run = await this.db.query.syncRuns.findFirst({
      where: eq(schema.syncRuns.id, syncRunId),
    })

    if (!run) return

    const durationMs = Date.now() - run.startedAt.getTime()

    await this.db
      .update(schema.syncRuns)
      .set({
        status: 'completed' as SyncRunStatus,
        completedAt: new Date(),
        durationMs,
        ...stats,
      })
      .where(eq(schema.syncRuns.id, syncRunId))
  }

  /**
   * Fail a sync run with error
   */
  async failSyncRun(syncRunId: string, error: string): Promise<void> {
    const run = await this.db.query.syncRuns.findFirst({
      where: eq(schema.syncRuns.id, syncRunId),
    })

    if (!run) return

    const durationMs = Date.now() - run.startedAt.getTime()

    await this.db
      .update(schema.syncRuns)
      .set({
        status: 'failed' as SyncRunStatus,
        completedAt: new Date(),
        durationMs,
        error,
      })
      .where(eq(schema.syncRuns.id, syncRunId))
  }

  /**
   * Get sync run history
   */
  async getSyncRuns(
    options: {
      sourceAccountId?: string
      limit?: number
      offset?: number
    } = {}
  ): Promise<SyncRun[]> {
    const { sourceAccountId, limit = 50, offset = 0 } = options

    return this.db.query.syncRuns.findMany({
      where: sourceAccountId
        ? eq(schema.syncRuns.sourceAccountId, sourceAccountId)
        : undefined,
      orderBy: [desc(schema.syncRuns.startedAt)],
      limit,
      offset,
    })
  }

  /**
   * Get sync run details with campaigns
   */
  async getSyncRunDetails(syncRunId: string): Promise<SyncRunDetails | null> {
    const run = await this.db.query.syncRuns.findFirst({
      where: eq(schema.syncRuns.id, syncRunId),
    })

    if (!run) return null

    const campaigns = await this.db.query.campaignSyncs.findMany({
      where: eq(schema.campaignSyncs.lastSyncRunId, syncRunId),
    })

    return { ...run, campaigns }
  }

  /**
   * Get widget history for a campaign
   */
  async getWidgetHistory(
    campaignSyncId: string,
    days: number = 30
  ): Promise<WidgetSync[]> {
    const since = new Date()
    since.setDate(since.getDate() - days)

    return this.db.query.widgetSyncs.findMany({
      where: and(
        eq(schema.widgetSyncs.campaignSyncId, campaignSyncId),
        gte(schema.widgetSyncs.syncedAt, since)
      ),
      orderBy: [desc(schema.widgetSyncs.syncedAt)],
    })
  }

  /**
   * Store widget snapshots
   */
  async storeWidgetSnapshots(
    syncRunId: string,
    campaignSyncId: string,
    widgets: Array<{
      widgetId: string
      widgetName?: string
      impressions?: number
      clicks?: number
      spend?: string
      conversions?: number
      revenue?: string
      ctr?: string
      cpc?: string
      cpa?: string
      roas?: string
      enabled?: boolean
      bidModifier?: string
    }>
  ): Promise<number> {
    if (widgets.length === 0) return 0

    const records = widgets.map((w) => ({
      syncRunId,
      campaignSyncId,
      widgetId: w.widgetId,
      widgetName: w.widgetName,
      impressions: w.impressions ?? 0,
      clicks: w.clicks ?? 0,
      spend: w.spend ?? '0',
      conversions: w.conversions ?? 0,
      revenue: w.revenue ?? '0',
      ctr: w.ctr,
      cpc: w.cpc,
      cpa: w.cpa,
      roas: w.roas,
      enabled: w.enabled ?? true,
      bidModifier: w.bidModifier,
    }))

    await this.db.insert(schema.widgetSyncs).values(records)

    return records.length
  }

  /**
   * Cleanup old widget history (retention policy)
   */
  async cleanupOldWidgetHistory(retentionDays: number = 30): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - retentionDays)

    // Count items to be deleted first
    const toDelete = await this.db.query.widgetSyncs.findMany({
      where: lte(schema.widgetSyncs.syncedAt, cutoff),
      columns: { id: true },
    })

    if (toDelete.length > 0) {
      await this.db
        .delete(schema.widgetSyncs)
        .where(lte(schema.widgetSyncs.syncedAt, cutoff))
    }

    return toDelete.length
  }

  /**
   * Cleanup old sync runs (retention policy)
   */
  async cleanupOldSyncRuns(retentionDays: number = 90): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - retentionDays)

    // Count items to be deleted first
    const toDelete = await this.db.query.syncRuns.findMany({
      where: lte(schema.syncRuns.startedAt, cutoff),
      columns: { id: true },
    })

    if (toDelete.length > 0) {
      await this.db
        .delete(schema.syncRuns)
        .where(lte(schema.syncRuns.startedAt, cutoff))
    }

    return toDelete.length
  }
}
