import { scheduler } from './scheduler.js'
import { logger } from '../lib/logger.js'

/**
 * Initialize all background jobs
 */
export function initJobs(): void {
  if (process.env.NODE_ENV === 'test') {
    logger.info('Skipping job initialization in test mode')
    return
  }

  scheduler.init()
}

export { scheduler }
