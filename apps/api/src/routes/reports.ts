/**
 * Reports API Routes
 *
 * Provides endpoints for optimizer reports and statistics:
 * - GET /api/reports/daily - Get daily stats for the last N days
 * - GET /api/reports/summary - Get overall performance summary
 * - POST /api/reports/trigger - Manually trigger daily report generation
 */

import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { sourceAccounts, campaignSyncs, optimizerActions, optimizerCampaigns } from '../db/schema.js'
import { dailyReportService } from '../services/report/index.js'
import { eq, and, desc, sql, gte, lt, inArray } from 'drizzle-orm'
import { logger } from '../lib/logger.js'

const reportsRouter = new Hono()

// Type for auth user from session
type Variables = {
  user: {
    id: string
    email: string
    name?: string
  }
}

/**
 * GET /api/reports/daily - Get daily statistics for the last N days
 * Query params:
 * - days (default: 7, max: 30)
 */
reportsRouter.get('/daily', async (c) => {
  const user = c.get('user' as never) as Variables['user']
  if (!user?.id) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const days = Math.min(30, Math.max(1, parseInt(c.req.query('days') || '7')))

  try {
    const stats = await dailyReportService.getUserReportStats(user.id, days)
    return c.json({ days: stats })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error: errorMsg }, 'Failed to get daily stats')
    return c.json({ error: 'Failed to get daily stats' }, 500)
  }
})

/**
 * GET /api/reports/summary - Get overall performance summary
 * Query params:
 * - from (ISO date, default: 30 days ago)
 * - to (ISO date, default: now)
 */
reportsRouter.get('/summary', async (c) => {
  const user = c.get('user' as never) as Variables['user']
  if (!user?.id) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const fromParam = c.req.query('from')
  const toParam = c.req.query('to')

  const toDate = toParam ? new Date(toParam) : new Date()
  const fromDate = fromParam ? new Date(fromParam) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000)

  try {
    // Get user's source accounts
    const userAccounts = await db
      .select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, user.id))

    if (userAccounts.length === 0) {
      return c.json({
        period: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
        totalSpend: 0,
        totalConversions: 0,
        averageCpa: 0,
        totalActions: 0,
        totalCampaigns: 0,
        actionsByType: {},
      })
    }

    const accountIds = userAccounts.map(a => a.id)

    // Aggregate campaign stats
    const syncStats = await db
      .select({
        totalSpend: sql<number>`COALESCE(SUM(${campaignSyncs.spend}), 0)`,
        totalConversions: sql<number>`COALESCE(SUM(${campaignSyncs.conversions}), 0)`,
        campaignCount: sql<number>`COUNT(DISTINCT ${campaignSyncs.externalCampaignId})`,
      })
      .from(campaignSyncs)
      .where(and(
        sql`${campaignSyncs.sourceAccountId} IN ${accountIds}`,
        gte(campaignSyncs.syncedAt, fromDate),
        lt(campaignSyncs.syncedAt, toDate)
      ))

    // Get optimizer campaigns for these accounts
    const userCampaigns = await db
      .select({ id: optimizerCampaigns.id })
      .from(optimizerCampaigns)
      .where(inArray(optimizerCampaigns.sourceAccountId, accountIds))

    const campaignIds = userCampaigns.map(c => c.id)

    // Count actions by type (via campaigns)
    const actionStats = campaignIds.length > 0 ? await db
      .select({
        actionType: optimizerActions.actionType,
        count: sql<number>`COUNT(*)`,
      })
      .from(optimizerActions)
      .where(and(
        inArray(optimizerActions.optimizerCampaignId, campaignIds),
        gte(optimizerActions.executedAt, fromDate),
        lt(optimizerActions.executedAt, toDate)
      ))
      .groupBy(optimizerActions.actionType) : []

    const sync = syncStats[0] || { totalSpend: 0, totalConversions: 0, campaignCount: 0 }
    const totalSpend = Number(sync.totalSpend) || 0
    const totalConversions = Number(sync.totalConversions) || 0

    // Build actions by type object
    const actionsByType: Record<string, number> = {}
    let totalActions = 0
    for (const stat of actionStats) {
      actionsByType[stat.actionType] = Number(stat.count) || 0
      totalActions += Number(stat.count) || 0
    }

    return c.json({
      period: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      totalSpend,
      totalConversions,
      averageCpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
      totalActions,
      totalCampaigns: Number(sync.campaignCount) || 0,
      actionsByType,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error: errorMsg }, 'Failed to get summary')
    return c.json({ error: 'Failed to get summary' }, 500)
  }
})

/**
 * POST /api/reports/trigger - Manually trigger daily report for testing
 * Body:
 * - date (ISO date string, optional - defaults to yesterday)
 */
reportsRouter.post('/trigger', async (c) => {
  const user = c.get('user' as never) as Variables['user']
  if (!user?.id) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const body = await c.req.json().catch(() => ({}))
    const date = body.date ? new Date(body.date) : undefined

    const result = await dailyReportService.generateAndSendReports(date)

    logger.info({ userId: user.id, result }, 'Manual daily report triggered')

    return c.json(result)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error: errorMsg }, 'Failed to trigger daily report')
    return c.json({ error: 'Failed to trigger daily report' }, 500)
  }
})

/**
 * GET /api/reports/actions - Get optimizer actions history
 * Query params:
 * - page (default: 1)
 * - limit (default: 20, max: 100)
 * - campaignId (filter by campaign)
 * - actionType (filter by type: pause, block, bid_adjustment, blacklist)
 * - from (ISO date)
 * - to (ISO date)
 */
reportsRouter.get('/actions', async (c) => {
  const user = c.get('user' as never) as Variables['user']
  if (!user?.id) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20')))
  const offset = (page - 1) * limit

  const campaignId = c.req.query('campaignId')
  const actionType = c.req.query('actionType')
  const from = c.req.query('from')
  const to = c.req.query('to')

  try {
    // Get user's source accounts
    const userAccounts = await db
      .select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, user.id))

    if (userAccounts.length === 0) {
      return c.json({
        actions: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
      })
    }

    const accountIds = userAccounts.map(a => a.id)

    // Get optimizer campaigns for these accounts
    const userCampaigns = await db
      .select({ id: optimizerCampaigns.id })
      .from(optimizerCampaigns)
      .where(inArray(optimizerCampaigns.sourceAccountId, accountIds))

    if (userCampaigns.length === 0) {
      return c.json({
        actions: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
      })
    }

    const campaignIds = userCampaigns.map(c => c.id)

    // Build where conditions
    const conditions: ReturnType<typeof and>[] = [inArray(optimizerActions.optimizerCampaignId, campaignIds)]

    if (campaignId) {
      conditions.push(eq(optimizerActions.optimizerCampaignId, campaignId))
    }
    if (actionType) {
      conditions.push(eq(optimizerActions.actionType, actionType))
    }
    if (from) {
      conditions.push(gte(optimizerActions.executedAt, new Date(from)))
    }
    if (to) {
      conditions.push(lt(optimizerActions.executedAt, new Date(to)))
    }

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(optimizerActions)
      .where(and(...conditions))

    const total = Number(countResult[0]?.count || 0)

    // Get actions
    const actions = await db
      .select()
      .from(optimizerActions)
      .where(and(...conditions))
      .orderBy(desc(optimizerActions.executedAt))
      .limit(limit)
      .offset(offset)

    return c.json({
      actions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error: errorMsg }, 'Failed to list actions')
    return c.json({ error: 'Failed to list actions' }, 500)
  }
})

export { reportsRouter }
