# Phase 2: Sync Service Updates

**Status:** ✅ Complete
**Effort:** 2.5h
**Parent:** [plan.md](./plan.md)
**Depends on:** [Phase 1](./phase-01-database-schema.md)

## Overview

Enhance CampaignSyncService with state machine, metrics tracking, and widget history.

## Files to Modify

### 1. `apps/api/src/services/campaign-sync.ts`

Add sync state machine and widget syncing to existing service.

```typescript
// State machine transitions
const SYNC_STATE_TRANSITIONS = {
  idle: ['syncing'],
  syncing: ['synced', 'error'],
  synced: ['syncing', 'idle'],
  error: ['syncing', 'idle'],
};

// Add to CampaignSyncService class:

async syncCampaignWithState(campaignSync: CampaignSync, syncRunId: string): Promise<void> {
  // 1. Check current state - skip if already syncing
  if (campaignSync.syncStatus === 'syncing') {
    console.log(`Campaign ${campaignSync.id} already syncing, skipping`);
    return;
  }

  // 2. Transition to syncing state
  await this.updateSyncState(campaignSync.id, 'syncing', syncRunId);

  try {
    // 3. Perform actual sync
    await this.syncCampaignData(campaignSync);

    // 4. Sync widgets and store history
    await this.syncWidgets(campaignSync, syncRunId);

    // 5. Transition to synced
    await this.updateSyncState(campaignSync.id, 'synced', syncRunId);
  } catch (error) {
    // 6. Transition to error
    await this.updateSyncState(campaignSync.id, 'error', syncRunId, error.message);
    throw error;
  }
}

private async updateSyncState(
  campaignSyncId: string,
  status: SyncStatus,
  syncRunId: string,
  error?: string
): Promise<void> {
  await this.db.update(campaignSyncs)
    .set({
      syncStatus: status,
      syncStartedAt: status === 'syncing' ? new Date() : undefined,
      syncError: error || null,
      lastSyncRunId: syncRunId,
    })
    .where(eq(campaignSyncs.id, campaignSyncId));
}

private async syncWidgets(campaignSync: CampaignSync, syncRunId: string): Promise<number> {
  const source = getTrafficSource(campaignSync.sourceId);
  const account = await this.getAccount(campaignSync.sourceAccountId);

  // Fetch widgets from traffic source
  const widgets = await source.getWidgetStats(account, campaignSync.externalCampaignId);

  // Store widget snapshots
  const widgetRecords = widgets.map(w => ({
    syncRunId,
    campaignSyncId: campaignSync.id,
    widgetId: w.id,
    widgetName: w.name,
    impressions: w.impressions,
    clicks: w.clicks,
    spend: w.spend,
    conversions: w.conversions,
    revenue: w.revenue,
    ctr: w.ctr,
    cpc: w.cpc,
    cpa: w.cpa,
    roas: w.roas,
    enabled: w.enabled,
    bidModifier: w.bidModifier,
  }));

  if (widgetRecords.length > 0) {
    await this.db.insert(widgetSyncs).values(widgetRecords);
  }

  return widgetRecords.length;
}
```

### 2. New File: `apps/api/src/services/sync-metrics.ts`

Sync audit/metrics service.

```typescript
import { db } from '../db';
import { syncRuns, campaignSyncs, widgetSyncs } from '../db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

export class SyncMetricsService {
  constructor(private db: typeof db) {}

  async startSyncRun(sourceAccountId: string, triggeredBy: 'scheduled' | 'manual'): Promise<string> {
    const [run] = await this.db.insert(syncRuns).values({
      sourceAccountId,
      triggeredBy,
      status: 'running',
      startedAt: new Date(),
    }).returning({ id: syncRuns.id });

    return run.id;
  }

  async completeSyncRun(
    syncRunId: string,
    stats: {
      campaignsTotal: number;
      campaignsSynced: number;
      campaignsFailed: number;
      widgetsSynced: number;
    }
  ): Promise<void> {
    const run = await this.db.query.syncRuns.findFirst({
      where: eq(syncRuns.id, syncRunId),
    });

    if (!run) return;

    const durationMs = Date.now() - run.startedAt.getTime();

    await this.db.update(syncRuns)
      .set({
        status: 'completed',
        completedAt: new Date(),
        durationMs,
        ...stats,
      })
      .where(eq(syncRuns.id, syncRunId));
  }

  async failSyncRun(syncRunId: string, error: string): Promise<void> {
    const run = await this.db.query.syncRuns.findFirst({
      where: eq(syncRuns.id, syncRunId),
    });

    if (!run) return;

    const durationMs = Date.now() - run.startedAt.getTime();

    await this.db.update(syncRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        durationMs,
        error,
      })
      .where(eq(syncRuns.id, syncRunId));
  }

  async getSyncRuns(options: {
    sourceAccountId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<SyncRun[]> {
    const { sourceAccountId, limit = 50, offset = 0 } = options;

    return this.db.query.syncRuns.findMany({
      where: sourceAccountId ? eq(syncRuns.sourceAccountId, sourceAccountId) : undefined,
      orderBy: [desc(syncRuns.startedAt)],
      limit,
      offset,
    });
  }

  async getSyncRunDetails(syncRunId: string): Promise<SyncRunDetails | null> {
    const run = await this.db.query.syncRuns.findFirst({
      where: eq(syncRuns.id, syncRunId),
    });

    if (!run) return null;

    const campaigns = await this.db.query.campaignSyncs.findMany({
      where: eq(campaignSyncs.lastSyncRunId, syncRunId),
    });

    return { ...run, campaigns };
  }

  async getWidgetHistory(campaignSyncId: string, days: number = 30): Promise<WidgetSync[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.db.query.widgetSyncs.findMany({
      where: and(
        eq(widgetSyncs.campaignSyncId, campaignSyncId),
        gte(widgetSyncs.syncedAt, since)
      ),
      orderBy: [desc(widgetSyncs.syncedAt)],
    });
  }

  // Cleanup job: remove widget history older than 30 days
  async cleanupOldWidgetHistory(retentionDays: number = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const result = await this.db.delete(widgetSyncs)
      .where(lte(widgetSyncs.syncedAt, cutoff));

    return result.rowCount ?? 0;
  }
}

export const syncMetricsService = new SyncMetricsService(db);
```

### 3. `apps/api/src/jobs/job-queue.ts`

Add manual-sync job handler.

```typescript
// Add new job type
type ManualSyncPayload = {
  type: 'account' | 'campaign';
  targetId: string;
  userId?: string;
};

// Register manual-sync handler in setupJobs()
await boss.work('manual-sync', async (job) => {
  const { type, targetId, userId } = job.data as ManualSyncPayload;

  console.log(`[manual-sync] Starting ${type} sync for ${targetId}`);

  if (type === 'account') {
    await campaignSyncService.syncAccount(targetId, 'manual');
  } else {
    await campaignSyncService.syncSingleCampaign(targetId, 'manual');
  }
});

// Add helper to queue manual sync
export async function queueManualSync(
  type: 'account' | 'campaign',
  targetId: string,
  userId?: string
): Promise<string | null> {
  return boss.send('manual-sync', { type, targetId, userId }, {
    priority: 10, // Higher priority than scheduled syncs
  });
}
```

## Implementation Steps

- [ ] Create SyncMetricsService class
- [ ] Add state machine to CampaignSyncService
- [ ] Add widget syncing to CampaignSyncService
- [ ] Update syncAll() to use new methods
- [ ] Add manual-sync job handler to job-queue.ts
- [ ] Add cleanup job for old widget history
- [ ] Update existing tests
- [ ] Add new tests for state machine

## State Machine Diagram

```
         ┌─────────────────────────────────────────┐
         │                                         │
         v                                         │
      ┌──────┐    start sync    ┌─────────┐       │
      │ idle │ ───────────────> │ syncing │       │
      └──────┘                  └─────────┘       │
         ^                          │             │
         │                          │             │
         │         ┌────────────────┴────────────┐│
         │         │                             ││
         │         v                             v│
         │    ┌────────┐                   ┌───────┐
         └────│ synced │                   │ error │
         │    └────────┘                   └───────┘
         │         │                             │
         └─────────┴─────────────────────────────┘
                    reset/retry
```

## Success Criteria

- [ ] Sync state visible per campaign
- [ ] Concurrent syncs prevented for same campaign
- [ ] Widget history stored on each sync
- [ ] Sync runs logged with duration/counts
- [ ] Manual sync queued via pg-boss
- [ ] Old widget history cleaned up automatically
