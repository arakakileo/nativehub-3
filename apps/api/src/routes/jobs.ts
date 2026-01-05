import { Hono } from 'hono'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.js'
import { triggerJob, getJobStatus, boss } from '../jobs/index.js'

const TriggerJobSchema = z.object({
  jobName: z.enum(['sync-campaigns', 'run-optimizer']),
})

const JobQueues = ['sync-campaigns', 'run-optimizer'] as const
type JobQueue = (typeof JobQueues)[number]

export const jobRoutes = new Hono()
  // Get optimizer job queue status
  .get('/optimizer/status', async (c) => {
    try {
      // Get queue sizes for different states
      const [pendingSize, activeJobs] = await Promise.all([
        boss.getQueueSize('run-optimizer'),
        boss.getQueueSize('run-optimizer', { before: 'active' }),
      ])

      // Get schedules to check if optimizer is scheduled
      const schedules = await boss.getSchedules()
      const optimizerSchedule = schedules.find((s) => s.name === 'run-optimizer')

      return c.json({
        status: 'ok',
        scheduler: {
          active: !!optimizerSchedule,
          cron: optimizerSchedule?.cron ?? null,
          timezone: optimizerSchedule?.timezone ?? null,
        },
        queue: {
          pending: pendingSize ?? 0,
          active: activeJobs ?? 0,
        },
      })
    } catch (error) {
      return c.json(
        {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    }
  })

  // Trigger job manually
  .post('/trigger', validateBody(TriggerJobSchema), async (c) => {
    const { jobName } = c.get('validatedBody') as z.infer<typeof TriggerJobSchema>
    const jobId = await triggerJob(jobName)
    return c.json({ jobId, jobName, status: 'queued' }, 202)
  })

  // Get job status by queue and job ID
  .get('/:queue/:jobId', async (c) => {
    const queue = c.req.param('queue') as JobQueue
    const jobId = c.req.param('jobId')

    if (!JobQueues.includes(queue)) {
      return c.json({ error: 'Invalid queue name' }, 400)
    }

    const job = await getJobStatus(queue, jobId)
    if (!job) {
      return c.json({ error: 'Job not found' }, 404)
    }
    return c.json({
      id: job.id,
      name: job.name,
      state: job.state,
      createdOn: job.createdOn,
      startedOn: job.startedOn,
      completedOn: job.completedOn,
      output: job.output,
      retryCount: job.retryCount,
    })
  })
