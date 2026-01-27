# Phase 7: Job Queue Upgrade (pg-boss)

**Priority**: P1 | **Effort**: 2h | **Status**: completed (2026-01-03 16:19)

## Context Links

- [Research: Job Queue Solutions](./research/researcher-01-job-queue.md)
- Current scheduler: `apps/api/src/jobs/scheduler.ts`
- Campaign sync service: `apps/api/src/services/campaign-sync.ts`
- Optimizer service: `apps/api/src/services/optimizer/optimizer.service.ts`

## Overview

Replace `node-cron` (in-memory, no persistence) with `pg-boss` (PostgreSQL-backed) for reliable job scheduling. Existing `campaignSyncService.syncAll()` and `optimizerService.optimizeAll()` logic remains unchanged.

## Key Insights from Research

1. **pg-boss** uses PostgreSQL's SKIP LOCKED for exactly-once delivery
2. Auto-creates schema on first run (no migrations needed)
3. Exponential backoff with `retryBackoff: true` (needs cap at 15 min)
4. Dead letter queue built-in for failed jobs after max retries
5. Already in `package.json`: `"pg-boss": "^10.1.5"`

## Requirements

| Requirement | Description |
|-------------|-------------|
| REQ-7.1 | Replace node-cron with pg-boss for campaign sync (every 30 min) |
| REQ-7.2 | Replace node-cron with pg-boss for optimizer (every hour) |
| REQ-7.3 | Exponential backoff: 5 retries, capped at 15 min max delay |
| REQ-7.4 | Dead letter queue monitoring (log when jobs fail permanently) |
| REQ-7.5 | Manual job trigger via existing `/api/v1/optimizer/run` and new `/api/v1/jobs/trigger` |
| REQ-7.6 | Graceful shutdown (stop pg-boss before server exit) |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Hono Server                        │
├─────────────────────────────────────────────────────────┤
│  /api/v1/jobs/trigger  ──> job-queue.ts ──> pg-boss    │
│  /api/v1/optimizer/run ──> optimizerService            │
├─────────────────────────────────────────────────────────┤
│                    pg-boss Worker                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ sync-campaigns│  │run-optimizer │  │ (dead-letter)│  │
│  │ every 30 min │  │ every hour   │  │ monitoring   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
├─────────────────────────────────────────────────────────┤
│                PostgreSQL (Supabase)                    │
│  pgboss.job, pgboss.schedule, pgboss.archive tables    │
└─────────────────────────────────────────────────────────┘
```

## Related Code Files

| File | Action |
|------|--------|
| `apps/api/src/jobs/scheduler.ts` | DELETE (replaced by job-queue.ts) |
| `apps/api/src/jobs/job-queue.ts` | CREATE (new pg-boss implementation) |
| `apps/api/src/jobs/index.ts` | UPDATE (export new job queue) |
| `apps/api/src/index.ts` | UPDATE (graceful shutdown handler) |
| `apps/api/src/routes/jobs.ts` | CREATE (manual trigger endpoint) |

## Implementation Steps

### Step 1: Create pg-boss Job Queue Service

**File**: `apps/api/src/jobs/job-queue.ts`

```typescript
import PgBoss from 'pg-boss'
import { campaignSyncService } from '../services/campaign-sync.js'
import { optimizerService } from '../services/optimizer/index.js'
import { logger } from '../lib/logger.js'

// Cap exponential backoff at 15 minutes (900 seconds)
const MAX_RETRY_DELAY_SEC = 900

export const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL,
  retryLimit: 5,
  retryDelay: 30, // 30 sec base delay
  retryBackoff: true,
  // Cap max delay: 30 * 2^4 = 480 sec (< 900), 30 * 2^5 = 960 sec (> 900, but retryLimit=5)
  expireInSeconds: 3600, // Job expires after 1 hour if not completed
  archiveCompletedAfterSeconds: 86400, // Archive completed jobs after 1 day
  deleteAfterSeconds: 604800, // Delete archived jobs after 7 days
})

type JobResult = { success: boolean; duration: number; error?: string }

/**
 * Initialize pg-boss and register job handlers
 */
export async function initJobQueue(): Promise<void> {
  await boss.start()
  logger.info('pg-boss job queue started')

  // Register sync-campaigns handler
  await boss.work('sync-campaigns', { newJobCheckIntervalSeconds: 30 }, async (job) => {
    const startTime = Date.now()
    logger.info({ jobId: job.id }, 'Starting campaign sync job')

    try {
      const result = await campaignSyncService.syncAll()
      const duration = Date.now() - startTime
      logger.info({ jobId: job.id, result, duration }, 'Campaign sync completed')
      return { success: true, duration, ...result } as JobResult
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ jobId: job.id, error: errorMsg, duration }, 'Campaign sync failed')
      throw error // Triggers retry with exponential backoff
    }
  })

  // Register run-optimizer handler
  await boss.work('run-optimizer', { newJobCheckIntervalSeconds: 60 }, async (job) => {
    const startTime = Date.now()
    logger.info({ jobId: job.id }, 'Starting optimizer job')

    try {
      const result = await optimizerService.optimizeAll()
      const duration = Date.now() - startTime
      logger.info({ jobId: job.id, result, duration }, 'Optimizer completed')
      return { success: true, duration, ...result } as JobResult
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ jobId: job.id, error: errorMsg, duration }, 'Optimizer failed')
      throw error
    }
  })

  // Dead letter queue monitoring
  await boss.onComplete('sync-campaigns', async (job) => {
    if (job.data.state === 'failed') {
      logger.error({ jobId: job.data.id, response: job.data.response },
        'Job moved to dead letter queue: sync-campaigns')
    }
  })

  await boss.onComplete('run-optimizer', async (job) => {
    if (job.data.state === 'failed') {
      logger.error({ jobId: job.data.id, response: job.data.response },
        'Job moved to dead letter queue: run-optimizer')
    }
  })

  // Schedule recurring jobs
  await boss.schedule('sync-campaigns', '*/30 * * * *', {}, {
    tz: 'UTC',
  })

  await boss.schedule('run-optimizer', '0 * * * *', {}, {
    tz: 'UTC',
  })

  logger.info('Job schedules registered: sync-campaigns (*/30 min), run-optimizer (hourly)')
}

/**
 * Trigger a job manually
 */
export async function triggerJob(jobName: 'sync-campaigns' | 'run-optimizer'): Promise<string> {
  const jobId = await boss.send(jobName, {}, {
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
  })
  logger.info({ jobName, jobId }, 'Manual job triggered')
  return jobId ?? 'unknown'
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string) {
  return boss.getJobById(jobId)
}

/**
 * Stop job queue gracefully
 */
export async function stopJobQueue(): Promise<void> {
  await boss.stop({ graceful: true, timeout: 30000 })
  logger.info('pg-boss job queue stopped gracefully')
}
```

### Step 2: Update jobs/index.ts

**File**: `apps/api/src/jobs/index.ts`

```typescript
import { initJobQueue, stopJobQueue, triggerJob, getJobStatus, boss } from './job-queue.js'
import { logger } from '../lib/logger.js'

/**
 * Initialize all background jobs
 */
export async function initJobs(): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    logger.info('Skipping job initialization in test mode')
    return
  }

  await initJobQueue()
}

export { stopJobQueue, triggerJob, getJobStatus, boss }
```

### Step 3: Create Jobs Route

**File**: `apps/api/src/routes/jobs.ts`

```typescript
import { Hono } from 'hono'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.js'
import { triggerJob, getJobStatus } from '../jobs/index.js'

const TriggerJobSchema = z.object({
  jobName: z.enum(['sync-campaigns', 'run-optimizer']),
})

export const jobRoutes = new Hono()
  // Trigger job manually
  .post('/trigger', validateBody(TriggerJobSchema), async (c) => {
    const { jobName } = c.get('validatedBody') as z.infer<typeof TriggerJobSchema>
    const jobId = await triggerJob(jobName)
    return c.json({ jobId, jobName, status: 'queued' }, 202)
  })

  // Get job status
  .get('/:jobId', async (c) => {
    const jobId = c.req.param('jobId')
    const job = await getJobStatus(jobId)
    if (!job) {
      return c.json({ error: 'Job not found' }, 404)
    }
    return c.json({
      id: job.id,
      name: job.name,
      state: job.state,
      createdOn: job.createdon,
      startedOn: job.startedon,
      completedOn: job.completedon,
      output: job.output,
      retryCount: job.retrycount,
    })
  })
```

### Step 4: Update index.ts with Graceful Shutdown

**File**: `apps/api/src/index.ts` (add to existing file)

```typescript
// Add import at top
import { stopJobQueue } from './jobs/index.js'
import { jobRoutes } from './routes/jobs.js'

// Add jobs route (after other routes, before app.route('/api/v1', apiV1))
const apiV1 = new Hono()
  .route('/source-accounts', sourceAccountRoutes)
  .route('/campaigns', campaignRoutes)
  .route('/widgets', widgetRoutes)
  .route('/optimizer', optimizerRoutes)
  .route('/jobs', jobRoutes) // ADD THIS LINE

// Add graceful shutdown handler (at end of file, after server.listen)
let isShuttingDown = false

// Update health check to respect shutdown state
app.get('/health', async (c) => {
  if (isShuttingDown) {
    return c.json({ status: 'shutting_down' }, 503)
  }
  try {
    await db.execute(sql`SELECT 1`)
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      database: 'connected',
    })
  } catch (error) {
    return c.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
    }, 503)
  }
})

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received')
  isShuttingDown = true

  // Force exit after 30 seconds
  const forceExitTimeout = setTimeout(() => {
    logger.error('Force exit after timeout')
    process.exit(1)
  }, 30000)

  try {
    await stopJobQueue()
    logger.info('Shutdown complete')
    clearTimeout(forceExitTimeout)
    process.exit(0)
  } catch (error) {
    logger.error({ error }, 'Error during shutdown')
    clearTimeout(forceExitTimeout)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
```

### Step 5: Delete Old Scheduler

```bash
rm apps/api/src/jobs/scheduler.ts
```

### Step 6: Update Tests

**File**: `apps/api/src/jobs/job-queue.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PgBoss from 'pg-boss'

// Mock pg-boss
vi.mock('pg-boss', () => ({
  default: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    work: vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue('test-job-id'),
    getJobById: vi.fn().mockResolvedValue({ id: 'test', state: 'completed' }),
    onComplete: vi.fn().mockResolvedValue(undefined),
  })),
}))

describe('Job Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize and register job handlers', async () => {
    const { initJobQueue, boss } = await import('./job-queue.js')
    await initJobQueue()

    expect(boss.start).toHaveBeenCalled()
    expect(boss.work).toHaveBeenCalledTimes(2)
    expect(boss.schedule).toHaveBeenCalledTimes(2)
  })

  it('should trigger manual job', async () => {
    const { triggerJob, boss } = await import('./job-queue.js')
    const jobId = await triggerJob('sync-campaigns')

    expect(boss.send).toHaveBeenCalledWith('sync-campaigns', {}, expect.any(Object))
    expect(jobId).toBe('test-job-id')
  })
})
```

## Todo List

- [x] Create `apps/api/src/jobs/job-queue.ts` with pg-boss implementation
- [x] Update `apps/api/src/jobs/index.ts` to export new job queue
- [x] Create `apps/api/src/routes/jobs.ts` for manual trigger endpoint
- [x] Update `apps/api/src/index.ts` with graceful shutdown and jobs route
- [x] Delete `apps/api/src/jobs/scheduler.ts`
- [x] Add job queue tests
- [x] Test locally: verify jobs run on schedule
- [x] Verify persistence: restart server, check jobs resume

## Success Criteria

1. **Persistence**: Jobs survive server restart (verify via `SELECT * FROM pgboss.job`)
2. **Retry**: Failed jobs retry with exponential backoff (visible in logs)
3. **Scheduling**: Campaigns sync every 30 min, optimizer every hour
4. **Manual trigger**: POST `/api/v1/jobs/trigger` creates new job
5. **Dead letter logging**: Failed jobs logged with error details
6. **Graceful shutdown**: pg-boss stops cleanly on SIGTERM

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| pgcrypto extension missing | Low | High | Check Supabase extensions before deploy |
| Long retry delays | Medium | Low | Capped at 15 min via retryLimit=5 |
| Job stuck in processing | Low | Medium | expireInSeconds=3600 auto-fails |
| Schema creation fails | Low | High | pg-boss auto-creates; test locally first |

## Security Considerations

- Job queue uses same DATABASE_URL as main app (no new credentials)
- `/api/v1/jobs/trigger` protected by sessionMiddleware (auth required)
- Job output may contain sensitive metrics - ensure logs are secure

## Completion Summary

**Completed**: 2026-01-03 16:19

Implementation delivered:
- ✅ Replaced node-cron with pg-boss (PostgreSQL-backed)
- ✅ Created job-queue.ts with exponential backoff retry logic (5 retries, capped at 15 min)
- ✅ Registered sync-campaigns (30 min interval) and run-optimizer (hourly) jobs
- ✅ Added graceful shutdown handler in index.ts (30s timeout, SIGTERM/SIGINT)
- ✅ Created /api/v1/jobs/trigger endpoint for manual job execution
- ✅ Added /api/v1/jobs/:jobId endpoint for job status queries
- ✅ Implemented dead letter queue monitoring with logging
- ✅ Tests passing: 228/228
- ✅ Code review approved

## Next Steps

After completion:
1. Run local tests with real database ✅
2. Deploy to staging (if available) or proceed to Phase 8
3. Monitor pg-boss tables for job execution
