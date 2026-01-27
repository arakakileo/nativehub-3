import { Hono } from 'hono'
import { z } from 'zod'
import { validateQuery } from '../middleware/validate.js'
import { syncRateLimiter } from '../middleware/rate-limit.js'
import { db } from '../lib/db.js'
import { sourceAccounts, campaignSyncs } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { queueManualSync, getJobStatus } from '../jobs/index.js'
import { SyncMetricsService } from '../services/sync-metrics.js'

const syncMetricsService = new SyncMetricsService(db)

// Query schemas
const ListRunsSchema = z.object({
  accountId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})

const WidgetHistorySchema = z.object({
  days: z.coerce.number().min(1).max(90).default(30),
})

export const syncRoutes = new Hono()
  // POST /api/sync/account/:accountId - Trigger account sync (rate limited)
  .post('/account/:accountId', syncRateLimiter, async (c) => {
    const accountId = c.req.param('accountId')
    const userId = c.get('userId') as string | undefined

    // Verify account exists
    const account = await db.query.sourceAccounts.findFirst({
      where: eq(sourceAccounts.id, accountId),
    })

    if (!account) {
      return c.json({ error: 'Account not found' }, 404)
    }

    // Verify ownership if userId available
    if (userId && account.userId !== userId) {
      return c.json({ error: 'Account not found' }, 404)
    }

    const jobId = await queueManualSync('account', accountId, userId)

    return c.json({
      success: true,
      jobId,
      message: `Sync queued for account ${account.name}`,
    })
  })

  // POST /api/sync/campaign/:campaignId - Trigger campaign sync (rate limited)
  .post('/campaign/:campaignId', syncRateLimiter, async (c) => {
    const campaignId = c.req.param('campaignId')
    const userId = c.get('userId') as string | undefined

    // Verify campaign exists and get account for ownership check
    const campaign = await db.query.campaignSyncs.findFirst({
      where: eq(campaignSyncs.id, campaignId),
    })

    if (!campaign) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    // Verify ownership if userId available
    if (userId) {
      const account = await db.query.sourceAccounts.findFirst({
        where: and(
          eq(sourceAccounts.id, campaign.sourceAccountId),
          eq(sourceAccounts.userId, userId)
        ),
      })

      if (!account) {
        return c.json({ error: 'Campaign not found' }, 404)
      }
    }

    const jobId = await queueManualSync('campaign', campaignId, userId)

    return c.json({
      success: true,
      jobId,
      message: `Sync queued for campaign ${campaign.campaignName}`,
    })
  })

  // GET /api/sync/runs - List sync run history
  .get('/runs', validateQuery(ListRunsSchema), async (c) => {
    const { accountId, limit, offset } = c.get('validatedQuery') as z.infer<typeof ListRunsSchema>
    const userId = c.get('userId') as string | undefined

    // If accountId provided, verify ownership
    if (accountId && userId) {
      const account = await db.query.sourceAccounts.findFirst({
        where: and(
          eq(sourceAccounts.id, accountId),
          eq(sourceAccounts.userId, userId)
        ),
      })

      if (!account) {
        return c.json({ error: 'Account not found' }, 404)
      }
    }

    const runs = await syncMetricsService.getSyncRuns({
      sourceAccountId: accountId,
      limit,
      offset,
    })

    return c.json({ runs })
  })

  // GET /api/sync/runs/:runId - Get sync run details
  .get('/runs/:runId', async (c) => {
    const runId = c.req.param('runId')
    const userId = c.get('userId') as string | undefined

    const details = await syncMetricsService.getSyncRunDetails(runId)

    if (!details) {
      return c.json({ error: 'Sync run not found' }, 404)
    }

    // Verify user owns this sync run's account
    if (details.sourceAccountId && userId) {
      const account = await db.query.sourceAccounts.findFirst({
        where: and(
          eq(sourceAccounts.id, details.sourceAccountId),
          eq(sourceAccounts.userId, userId)
        ),
      })

      if (!account) {
        return c.json({ error: 'Sync run not found' }, 404)
      }
    }

    return c.json(details)
  })

  // GET /api/sync/widgets/:campaignId - Get widget history for campaign
  .get('/widgets/:campaignId', validateQuery(WidgetHistorySchema), async (c) => {
    const campaignId = c.req.param('campaignId')
    const { days } = c.get('validatedQuery') as z.infer<typeof WidgetHistorySchema>
    const userId = c.get('userId') as string | undefined

    // Verify campaign exists
    const campaign = await db.query.campaignSyncs.findFirst({
      where: eq(campaignSyncs.id, campaignId),
    })

    if (!campaign) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    // Verify ownership if userId available
    if (userId) {
      const account = await db.query.sourceAccounts.findFirst({
        where: and(
          eq(sourceAccounts.id, campaign.sourceAccountId),
          eq(sourceAccounts.userId, userId)
        ),
      })

      if (!account) {
        return c.json({ error: 'Campaign not found' }, 404)
      }
    }

    const history = await syncMetricsService.getWidgetHistory(campaignId, days)

    return c.json({ widgets: history })
  })

  // GET /api/sync/job/:jobId - Get manual sync job status
  .get('/job/:jobId', async (c) => {
    const jobId = c.req.param('jobId')

    const job = await getJobStatus('manual-sync', jobId)
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
