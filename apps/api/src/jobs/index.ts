import { initJobQueue, stopJobQueue, triggerJob, getJobStatus, queueManualSync, boss } from './job-queue.js'
import { logger } from '../lib/logger.js'

/**
 * Initialize all background jobs
 */
export async function initJobs(): Promise<void> {
  if (process.env['NODE_ENV'] === 'test') {
    logger.info('Skipping job initialization in test mode')
    return
  }

  await initJobQueue()
}

export { stopJobQueue, triggerJob, getJobStatus, queueManualSync, boss }
