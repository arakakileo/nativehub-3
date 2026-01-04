import PgBoss from 'pg-boss'
import { campaignSyncService } from '../services/campaign-sync.js'
import { optimizerService } from '../services/optimizer/index.js'
import { logger } from '../lib/logger.js'

// pg-boss configuration with exponential backoff
// Base delay 30s, retryLimit 5: delays = 30, 60, 120, 240, 480 (max ~8 min)
export const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL,
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 3600, // Job expires after 1 hour if not completed
  archiveCompletedAfterSeconds: 86400, // Archive completed jobs after 1 day
  deleteAfterSeconds: 604800, // Delete archived jobs after 7 days
})

interface JobResult {
  success: boolean
  duration: number
  synced?: number
  failed?: number
  optimized?: number
  error?: string
}

/**
 * Initialize pg-boss and register job handlers
 */
export async function initJobQueue(): Promise<void> {
  await boss.start()
  logger.info('pg-boss job queue started')

  // Create queues explicitly before registering workers and schedules
  await boss.createQueue('sync-campaigns')
  await boss.createQueue('run-optimizer')

  // Register sync-campaigns handler (pg-boss v10 receives array of jobs)
  await boss.work('sync-campaigns', { pollingIntervalSeconds: 30 }, async (jobs) => {
    for (const job of jobs) {
      const startTime = Date.now()
      logger.info({ jobId: job.id }, 'Starting campaign sync job')

      try {
        const result = await campaignSyncService.syncAll()
        const duration = Date.now() - startTime
        logger.info({ jobId: job.id, result, duration }, 'Campaign sync completed')
      } catch (error) {
        const duration = Date.now() - startTime
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        logger.error({ jobId: job.id, error: errorMsg, duration }, 'Campaign sync failed')
        throw error // Triggers retry with exponential backoff
      }
    }
  })

  // Register run-optimizer handler
  await boss.work('run-optimizer', { pollingIntervalSeconds: 60 }, async (jobs) => {
    for (const job of jobs) {
      const startTime = Date.now()
      logger.info({ jobId: job.id }, 'Starting optimizer job')

      try {
        const result = await optimizerService.optimizeAll()
        const duration = Date.now() - startTime
        logger.info({ jobId: job.id, result, duration }, 'Optimizer completed')
      } catch (error) {
        const duration = Date.now() - startTime
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        logger.error({ jobId: job.id, error: errorMsg, duration }, 'Optimizer failed')
        throw error
      }
    }
  })

  // Schedule recurring jobs
  // Campaign sync every 30 minutes
  await boss.schedule('sync-campaigns', '*/30 * * * *', {}, {
    tz: 'UTC',
  })

  // Optimizer runs every hour at minute 0
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
 * Get job status by ID
 * Note: pg-boss v10 requires queue name as first parameter
 */
export async function getJobStatus(queueName: string, jobId: string) {
  return boss.getJobById(queueName, jobId)
}

/**
 * Stop job queue gracefully
 */
export async function stopJobQueue(): Promise<void> {
  await boss.stop({ graceful: true, timeout: 30000 })
  logger.info('pg-boss job queue stopped gracefully')
}
