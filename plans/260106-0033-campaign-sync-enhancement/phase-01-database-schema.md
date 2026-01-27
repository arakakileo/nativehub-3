# Phase 1: Database Schema Changes

**Status:** ✅ Complete
**Effort:** 1.5h
**Parent:** [plan.md](./plan.md)

## Overview

Add database tables and fields to support sync metrics, widget history, and sync state tracking.

## New Tables

### 1. `sync_runs` - Audit Log Table

Tracks each sync execution with timing and metrics.

```typescript
// apps/api/src/db/schema.ts

export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceAccountId: uuid('source_account_id').references(() => sourceAccounts.id),
  triggeredBy: text('triggered_by').notNull(), // 'scheduled' | 'manual'
  status: text('status').notNull().default('running'), // 'running' | 'completed' | 'failed'
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  durationMs: integer('duration_ms'),
  campaignsTotal: integer('campaigns_total').default(0),
  campaignsSynced: integer('campaigns_synced').default(0),
  campaignsFailed: integer('campaigns_failed').default(0),
  widgetsSynced: integer('widgets_synced').default(0),
  error: text('error'),
  metadata: jsonb('metadata'), // Additional context
});
```

### 2. `widget_syncs` - Widget History Table

Stores historical widget performance snapshots.

```typescript
export const widgetSyncs = pgTable('widget_syncs', {
  id: uuid('id').primaryKey().defaultRandom(),
  syncRunId: uuid('sync_run_id').references(() => syncRuns.id),
  campaignSyncId: uuid('campaign_sync_id').references(() => campaignSyncs.id),
  widgetId: text('widget_id').notNull(),
  widgetName: text('widget_name'),
  // Metrics snapshot
  impressions: integer('impressions').default(0),
  clicks: integer('clicks').default(0),
  spend: numeric('spend', { precision: 12, scale: 4 }).default('0'),
  conversions: integer('conversions').default(0),
  revenue: numeric('revenue', { precision: 12, scale: 4 }).default('0'),
  ctr: numeric('ctr', { precision: 8, scale: 6 }),
  cpc: numeric('cpc', { precision: 10, scale: 4 }),
  cpa: numeric('cpa', { precision: 10, scale: 4 }),
  roas: numeric('roas', { precision: 10, scale: 4 }),
  // Status
  enabled: boolean('enabled').default(true),
  bidModifier: numeric('bid_modifier', { precision: 5, scale: 2 }),
  // Timestamps
  syncedAt: timestamp('synced_at').notNull().defaultNow(),
}, (table) => ({
  campaignSyncIdx: index('widget_syncs_campaign_sync_idx').on(table.campaignSyncId),
  syncRunIdx: index('widget_syncs_sync_run_idx').on(table.syncRunId),
  syncedAtIdx: index('widget_syncs_synced_at_idx').on(table.syncedAt),
}));
```

## Modified Tables

### 3. `campaign_syncs` - Add Sync State Fields

```typescript
// Add these fields to existing campaignSyncs table:
syncStatus: text('sync_status').default('idle'), // 'idle' | 'syncing' | 'synced' | 'error'
syncStartedAt: timestamp('sync_started_at'),
syncError: text('sync_error'),
lastSyncRunId: uuid('last_sync_run_id').references(() => syncRuns.id),
```

## Indexes

```typescript
// syncRuns indexes
index('sync_runs_source_account_idx').on(syncRuns.sourceAccountId),
index('sync_runs_started_at_idx').on(syncRuns.startedAt),
index('sync_runs_status_idx').on(syncRuns.status),

// campaignSyncs indexes (new)
index('campaign_syncs_sync_status_idx').on(campaignSyncs.syncStatus),
```

## Type Exports

```typescript
export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;
export type WidgetSync = typeof widgetSyncs.$inferSelect;
export type NewWidgetSync = typeof widgetSyncs.$inferInsert;

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';
export type SyncTrigger = 'scheduled' | 'manual';
export type SyncRunStatus = 'running' | 'completed' | 'failed';
```

## Migration Strategy

1. Add new tables first (no dependencies)
2. Add new columns to campaignSyncs with defaults
3. Create indexes
4. No data migration needed (new fields)

## Implementation Steps

- [ ] Add `syncRuns` table definition to schema.ts
- [ ] Add `widgetSyncs` table definition to schema.ts
- [ ] Add sync state fields to `campaignSyncs` table
- [ ] Add all indexes
- [ ] Export new types
- [ ] Run `drizzle-kit generate` for migration
- [ ] Test migration locally

## Success Criteria

- [ ] All new tables created successfully
- [ ] campaignSyncs has new sync state fields
- [ ] Types exported and available
- [ ] No breaking changes to existing queries
