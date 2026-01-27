---
title: "Campaign Sync Service Enhancement - Phase 7"
description: "Add sync metrics, manual sync API, widget history, and sync state machine to NativeHub 3.0"
status: complete
priority: P2
effort: 6h
branch: master
tags: [sync, api, database, monitoring, pg-boss]
created: 2026-01-06
completed: 2026-01-06T01:43:00Z
---

# Campaign Sync Service Enhancement - NativeHub 3.0 Phase 7

## Overview

Enhance the existing campaign sync infrastructure with:
1. **Sync Metrics & Audit Log** - Track sync runs for debugging/monitoring
2. **Manual Sync API** - On-demand sync for specific accounts/campaigns
3. **Widget History Table** - Historical widget performance tracking
4. **Sync State Machine** - Per-campaign sync status tracking

## Current State

### Existing Infrastructure (apps/api/src/)
- **Job Queue**: pg-boss v10 with 4 scheduled jobs including `sync-campaigns` (30 min)
- **Sync Service**: `services/campaign-sync.ts` - syncAll() method
- **Traffic Sources**: 4 implemented (Revcontent, Taboola, Outbrain, MGID)
- **Database**: Drizzle ORM with PostgreSQL

### Key Files
- `apps/api/src/jobs/job-queue.ts` - pg-boss setup
- `apps/api/src/services/campaign-sync.ts` - CampaignSyncService
- `apps/api/src/db/schema.ts` - Database schema
- `apps/api/src/traffic-sources/` - Traffic source implementations

## Implementation Phases

| Phase | Scope | Effort | File |
|-------|-------|--------|------|
| 1 | Database Schema | 1.5h | [phase-01-database-schema.md](./phase-01-database-schema.md) |
| 2 | Sync Service Updates | 2.5h | [phase-02-sync-service.md](./phase-02-sync-service.md) |
| 3 | API Routes | 2h | [phase-03-api-routes.md](./phase-03-api-routes.md) |

## Database Changes Summary

### New Tables
1. `sync_runs` - Audit log for each sync execution
2. `widget_syncs` - Historical widget performance snapshots

### Modified Tables
1. `campaign_syncs` - Add sync state fields (syncStatus, syncStartedAt, syncError)

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/sync/account/:accountId` | Trigger account sync via pg-boss |
| POST | `/api/v1/sync/campaign/:campaignId` | Trigger campaign sync via pg-boss |
| GET | `/api/v1/sync/runs` | List sync run history |
| GET | `/api/v1/sync/runs/:runId` | Get sync run details |
| GET | `/api/v1/sync/widgets/:campaignId` | Get widget history for campaign |

## Technical Decisions

### pg-boss Integration
- Manual syncs queued via `jobQueue.sendJob('manual-sync', data)`
- New job type registered for manual syncs
- Reuses existing job queue infrastructure

### Sync State Machine
States: `idle` | `syncing` | `synced` | `error`
- Prevents concurrent syncs for same campaign
- Enables partial retry on error
- Progress tracking per campaign

### Widget History Strategy
- Snapshot on each sync run
- 30-day retention via cleanup job
- Enables trend analysis for optimizer

## Files to Create/Modify

### New Files
```
apps/api/src/
  routes/sync.ts           # New API routes
  services/sync-metrics.ts # Sync audit service
```

### Modified Files
```
apps/api/src/
  db/schema.ts             # Add syncRuns, widgetSyncs tables
  services/campaign-sync.ts # Add state machine, widget sync
  jobs/job-queue.ts        # Add manual-sync job handler
```

## Success Criteria

1. Sync runs logged with metrics (duration, counts, errors)
2. Manual sync API returns job ID, queued via pg-boss
3. Widget history populated on each sync
4. Sync status visible per campaign
5. All existing tests pass (432 tests)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Sync conflicts (manual + scheduled) | State machine prevents concurrent syncs |
| Large widget history | 30-day retention, indexed queries |
| API rate limits | Reuse existing rate limiter |
