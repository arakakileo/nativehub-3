import cron from 'node-cron'
import { optimizerService } from '../services/optimizer/index.js'
import { logger } from '../lib/logger.js'

/**
 * Job Scheduler - Manages background jobs
 */
class Scheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map()

  /**
   * Initialize all scheduled jobs
   */
  init(): void {
    logger.info('Initializing job scheduler')

    // Optimizer runs every hour at minute 0
    this.scheduleJob('optimizer', '0 * * * *', async () => {
      logger.info('Running hourly optimization')
      try {
        const result = await optimizerService.optimizeAll()
        logger.info(result, 'Hourly optimization complete')
      } catch (error) {
        logger.error({ error }, 'Hourly optimization failed')
      }
    })

    // Sync campaigns every 30 minutes (optional - can be enabled later)
    // this.scheduleJob('sync', '*/30 * * * *', async () => {
    //   logger.info('Running campaign sync')
    //   // ... sync implementation
    // })

    logger.info({ jobCount: this.jobs.size }, 'Job scheduler initialized')
  }

  /**
   * Schedule a cron job
   */
  private scheduleJob(name: string, schedule: string, fn: () => Promise<void>): void {
    if (this.jobs.has(name)) {
      logger.warn({ job: name }, 'Job already exists, stopping old instance')
      this.jobs.get(name)?.stop()
    }

    const task = cron.schedule(schedule, async () => {
      const startTime = Date.now()
      logger.info({ job: name }, 'Job started')

      try {
        await fn()
        const duration = Date.now() - startTime
        logger.info({ job: name, duration }, 'Job completed')
      } catch (error) {
        logger.error({ job: name, error }, 'Job failed')
      }
    }, {
      timezone: 'UTC',
    })

    this.jobs.set(name, task)
    logger.info({ job: name, schedule }, 'Job scheduled')
  }

  /**
   * Stop a specific job
   */
  stopJob(name: string): void {
    const job = this.jobs.get(name)
    if (job) {
      job.stop()
      this.jobs.delete(name)
      logger.info({ job: name }, 'Job stopped')
    }
  }

  /**
   * Stop all jobs
   */
  stopAll(): void {
    for (const [name, job] of this.jobs) {
      job.stop()
      logger.info({ job: name }, 'Job stopped')
    }
    this.jobs.clear()
    logger.info('All jobs stopped')
  }

  /**
   * Manually trigger a job
   */
  async triggerJob(name: string): Promise<void> {
    logger.info({ job: name }, 'Manually triggering job')

    switch (name) {
      case 'optimizer':
        await optimizerService.optimizeAll()
        break
      default:
        throw new Error(`Unknown job: ${name}`)
    }
  }
}

export const scheduler = new Scheduler()
