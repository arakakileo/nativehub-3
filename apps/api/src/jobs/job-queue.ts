import PgBoss from 'pg-boss'
import { campaignSyncService } from '../services/campaign-sync.js'
import { optimizerService } from '../services/optimizer/index.js'
import { reactivationService } from '../services/optimizer/reactivation.service.js'
import { dailyReportService } from '../services/report/index.js'
import { logger } from '../lib/logger.js'
import { cleanupConfig } from '../lib/config.js'

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

// Manual sync job payload
interface ManualSyncPayload {
  type: 'account' | 'campaign'
  targetId: string
  userId?: string
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
  await boss.createQueue('process-reactivations')
  await boss.createQueue('send-daily-reports')
  await boss.createQueue('manual-sync')
  await boss.createQueue('cleanup-old-data')

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

  // Register process-reactivations handler
  // Processes paused widgets that have passed their cooldown period
  await boss.work('process-reactivations', { pollingIntervalSeconds: 60 }, async (jobs) => {
    for (const job of jobs) {
      const startTime = Date.now()
      logger.info({ jobId: job.id }, 'Starting reactivation processing job')

      try {
        const result = await reactivationService.processReactivations()
        const duration = Date.now() - startTime
        logger.info({ jobId: job.id, result, duration }, 'Reactivation processing completed')
      } catch (error) {
        const duration = Date.now() - startTime
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        logger.error({ jobId: job.id, error: errorMsg, duration }, 'Reactivation processing failed')
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

  // Reactivation check every 6 hours (at 0, 6, 12, 18)
  await boss.schedule('process-reactivations', '0 */6 * * *', {}, {
    tz: 'UTC',
  })

  // Register send-daily-reports handler
  // Sends daily summary reports to all users with notifications enabled
  await boss.work('send-daily-reports', { pollingIntervalSeconds: 60 }, async (jobs) => {
    for (const job of jobs) {
      const startTime = Date.now()
      logger.info({ jobId: job.id }, 'Starting daily report job')

      try {
        const result = await dailyReportService.generateAndSendReports()
        const duration = Date.now() - startTime
        logger.info({ jobId: job.id, result, duration }, 'Daily report job completed')
      } catch (error) {
        const duration = Date.now() - startTime
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        logger.error({ jobId: job.id, error: errorMsg, duration }, 'Daily report job failed')
        throw error
      }
    }
  })

  // Daily reports at 8:00 AM UTC (5:00 AM BRT)
  await boss.schedule('send-daily-reports', '0 8 * * *', {}, {
    tz: 'UTC',
  })

  // Register cleanup-old-data handler for retention policies
  await boss.work('cleanup-old-data', { pollingIntervalSeconds: 60 }, async (jobs) => {
    for (const job of jobs) {
      const startTime = Date.now()
      logger.info({ jobId: job.id }, 'Starting cleanup job')

      try {
        const metricsService = campaignSyncService.getMetricsService()
        const widgetsDeleted = await metricsService.cleanupOldWidgetHistory(cleanupConfig.widgetHistoryRetentionDays)
        const syncRunsDeleted = await metricsService.cleanupOldSyncRuns(cleanupConfig.syncRunRetentionDays)
        const duration = Date.now() - startTime
        logger.info({
          jobId: job.id,
          widgetsDeleted,
          syncRunsDeleted,
          duration
        }, 'Cleanup job completed')
      } catch (error) {
        const duration = Date.now() - startTime
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        logger.error({ jobId: job.id, error: errorMsg, duration }, 'Cleanup job failed')
        throw error
      }
    }
  })

  // Cleanup runs weekly on Sunday at 3:00 AM UTC
  await boss.schedule('cleanup-old-data', '0 3 * * 0', {}, {
    tz: 'UTC',
  })

  // Register manual-sync handler for on-demand syncs (Phase 7)
  await boss.work('manual-sync', { pollingIntervalSeconds: 5 }, async (jobs) => {
    for (const job of jobs) {
      const startTime = Date.now()
      const { type, targetId, userId } = job.data as ManualSyncPayload
      logger.info({ jobId: job.id, type, targetId, userId }, 'Starting manual sync job')

      try {
        if (type === 'account') {
          await campaignSyncService.syncAccount(targetId, 'manual')
        } else {
          await campaignSyncService.syncSingleCampaign(targetId, 'manual')
        }
        const duration = Date.now() - startTime
        logger.info({ jobId: job.id, type, targetId, duration }, 'Manual sync completed')
      } catch (error) {
        const duration = Date.now() - startTime
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        logger.error({ jobId: job.id, type, targetId, error: errorMsg, duration }, 'Manual sync failed')
        throw error
      }
    }
  })

  logger.info('Job schedules registered: sync-campaigns (*/30 min), run-optimizer (hourly), process-reactivations (every 6h), send-daily-reports (8:00 UTC), cleanup-old-data (weekly Sun 3:00 UTC), manual-sync (on-demand)')
}

/**
 * Trigger a job manually
 */
export async function triggerJob(jobName: 'sync-campaigns' | 'run-optimizer' | 'process-reactivations' | 'send-daily-reports' | 'cleanup-old-data'): Promise<string> {
  const jobId = await boss.send(jobName, {}, {
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
  })
  logger.info({ jobName, jobId }, 'Manual job triggered')
  return jobId ?? 'unknown'
}

/**
 * Queue a manual sync for account or campaign (Phase 7)
 * Higher priority than scheduled syncs for faster response
 */
export async function queueManualSync(
  type: 'account' | 'campaign',
  targetId: string,
  userId?: string
): Promise<string | null> {
  const jobId = await boss.send('manual-sync', { type, targetId, userId } as ManualSyncPayload, {
    priority: 10, // Higher priority than scheduled syncs
    retryLimit: 3,
    retryDelay: 10,
    retryBackoff: true,
  })
  logger.info({ type, targetId, userId, jobId }, 'Manual sync queued')
  return jobId
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
