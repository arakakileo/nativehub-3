/**
 * Alerts API Routes
 *
 * Provides endpoints for managing user alerts:
 * - GET /api/alerts - List user alerts with pagination and filtering
 * - GET /api/alerts/:id - Get single alert
 * - PATCH /api/alerts/:id/acknowledge - Mark alert as acknowledged
 * - PATCH /api/alerts/acknowledge-all - Mark all alerts as acknowledged
 * - GET /api/alerts/unread-count - Get count of unacknowledged alerts
 */

import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { alerts } from '../db/schema.js'
import { eq, and, desc, sql, isNull, gte, lte, inArray } from 'drizzle-orm'
import { logger } from '../lib/logger.js'

const alertsRouter = new Hono()

// Type for auth user from session
type Variables = {
  user: {
    id: string
    email: string
    name?: string
  }
}

/**
 * GET /api/alerts - List user alerts
 * Query params:
 * - page (default: 1)
 * - limit (default: 20, max: 100)
 * - severity (info|warning|critical)
 * - type (action_executed|critical_spend|daily_report|optimizer_error)
 * - acknowledged (true|false)
 * - from (ISO date)
 * - to (ISO date)
 */
alertsRouter.get('/', async (c) => {
  const user = c.get('user' as never) as Variables['user']
  if (!user?.id) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20')))
  const offset = (page - 1) * limit

  const severity = c.req.query('severity')
  const alertType = c.req.query('type')
  const acknowledged = c.req.query('acknowledged')
  const from = c.req.query('from')
  const to = c.req.query('to')

  try {
    // Build where conditions
    const conditions = [eq(alerts.userId, user.id)]

    if (severity) {
      conditions.push(eq(alerts.severity, severity))
    }
    if (alertType) {
      conditions.push(eq(alerts.alertType, alertType))
    }
    if (acknowledged !== undefined && acknowledged !== '') {
      conditions.push(eq(alerts.acknowledged, acknowledged === 'true'))
    }
    if (from) {
      conditions.push(gte(alerts.createdAt, new Date(from)))
    }
    if (to) {
      conditions.push(lte(alerts.createdAt, new Date(to)))
    }

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(alerts)
      .where(and(...conditions))

    const total = Number(countResult[0]?.count || 0)

    // Get alerts
    const userAlerts = await db
      .select()
      .from(alerts)
      .where(and(...conditions))
      .orderBy(desc(alerts.createdAt))
      .limit(limit)
      .offset(offset)

    return c.json({
      alerts: userAlerts,
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
    logger.error({ error: errorMsg }, 'Failed to list alerts')
    return c.json({ error: 'Failed to list alerts' }, 500)
  }
})

/**
 * GET /api/alerts/unread-count - Get count of unacknowledged alerts
 */
alertsRouter.get('/unread-count', async (c) => {
  const user = c.get('user' as never) as Variables['user']
  if (!user?.id) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(alerts)
      .where(and(
        eq(alerts.userId, user.id),
        eq(alerts.acknowledged, false)
      ))

    return c.json({ count: Number(result[0]?.count || 0) })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error: errorMsg }, 'Failed to get unread count')
    return c.json({ error: 'Failed to get unread count' }, 500)
  }
})

/**
 * GET /api/alerts/:id - Get single alert
 */
alertsRouter.get('/:id', async (c) => {
  const user = c.get('user' as never) as Variables['user']
  if (!user?.id) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const alertId = c.req.param('id')

  try {
    const alert = await db
      .select()
      .from(alerts)
      .where(and(
        eq(alerts.id, alertId),
        eq(alerts.userId, user.id)
      ))
      .limit(1)

    if (alert.length === 0) {
      return c.json({ error: 'Alert not found' }, 404)
    }

    return c.json(alert[0])
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error: errorMsg, alertId }, 'Failed to get alert')
    return c.json({ error: 'Failed to get alert' }, 500)
  }
})

/**
 * PATCH /api/alerts/:id/acknowledge - Mark alert as acknowledged
 */
alertsRouter.patch('/:id/acknowledge', async (c) => {
  const user = c.get('user' as never) as Variables['user']
  if (!user?.id) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const alertId = c.req.param('id')

  try {
    const result = await db
      .update(alerts)
      .set({
        acknowledged: true,
        acknowledgedAt: new Date(),
      })
      .where(and(
        eq(alerts.id, alertId),
        eq(alerts.userId, user.id)
      ))
      .returning()

    if (result.length === 0) {
      return c.json({ error: 'Alert not found' }, 404)
    }

    return c.json(result[0])
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error: errorMsg, alertId }, 'Failed to acknowledge alert')
    return c.json({ error: 'Failed to acknowledge alert' }, 500)
  }
})

/**
 * PATCH /api/alerts/acknowledge-all - Mark all unread alerts as acknowledged
 */
alertsRouter.patch('/acknowledge-all', async (c) => {
  const user = c.get('user' as never) as Variables['user']
  if (!user?.id) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const result = await db
      .update(alerts)
      .set({
        acknowledged: true,
        acknowledgedAt: new Date(),
      })
      .where(and(
        eq(alerts.userId, user.id),
        eq(alerts.acknowledged, false)
      ))
      .returning({ id: alerts.id })

    return c.json({ acknowledged: result.length })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error: errorMsg }, 'Failed to acknowledge all alerts')
    return c.json({ error: 'Failed to acknowledge all alerts' }, 500)
  }
})

export { alertsRouter }
