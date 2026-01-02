import { Hono } from 'hono'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { validateBody } from '../middleware/validate.js'
import { db } from '../lib/db.js'
import { sourceAccounts, widgetBlacklist } from '../db/schema.js'

// Validation schemas
const BlacklistWidgetSchema = z.object({
  sourceAccountId: z.string().uuid(),
  widgetId: z.string().min(1),
  widgetDomain: z.string().optional(),
  externalCampaignId: z.string().optional(),
  reason: z.string().optional(),
})

// Note: sessionMiddleware is applied globally in index.ts for all /api/v1/* routes
export const widgetRoutes = new Hono()
  // List blacklisted widgets
  .get('/blacklist', async (c) => {
    const userId = c.get('userId')
    const sourceAccountId = c.req.query('sourceAccountId')
    const externalCampaignId = c.req.query('externalCampaignId')

    // Get user's source accounts
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    if (accounts.length === 0) {
      return c.json({ data: [] })
    }

    const accountIds = accounts.map((a) => a.id)

    // Get all blacklist entries
    const entries = await db.select().from(widgetBlacklist)
      .orderBy(widgetBlacklist.createdAt)

    // Filter by user's accounts
    let filtered = entries.filter((e) => accountIds.includes(e.sourceAccountId))

    // Apply filters
    if (sourceAccountId) {
      filtered = filtered.filter((e) => e.sourceAccountId === sourceAccountId)
    }
    if (externalCampaignId) {
      filtered = filtered.filter((e) => e.externalCampaignId === externalCampaignId)
    }

    return c.json({
      data: filtered.map((e) => ({
        id: e.id,
        sourceAccountId: e.sourceAccountId,
        widgetId: e.widgetId,
        widgetDomain: e.widgetDomain,
        externalCampaignId: e.externalCampaignId,
        reason: e.reason,
        autoBlacklisted: e.autoBlacklisted,
        metricsAtBlacklist: e.metricsAtBlacklist,
        createdAt: e.createdAt,
      })),
    })
  })

  // Add widget to blacklist
  .post('/blacklist', validateBody(BlacklistWidgetSchema), async (c) => {
    const userId = c.get('userId')
    const body = c.get('validatedBody') as z.infer<typeof BlacklistWidgetSchema>

    // Verify user owns the source account
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(and(
        eq(sourceAccounts.id, body.sourceAccountId),
        eq(sourceAccounts.userId, userId)
      ))

    if (accounts.length === 0) {
      return c.json({ error: 'Source account not found' }, 404)
    }

    // Check if already blacklisted
    const existing = await db.select().from(widgetBlacklist)
      .where(and(
        eq(widgetBlacklist.sourceAccountId, body.sourceAccountId),
        eq(widgetBlacklist.widgetId, body.widgetId),
        body.externalCampaignId
          ? eq(widgetBlacklist.externalCampaignId, body.externalCampaignId)
          : undefined as never
      ))

    if (existing.length > 0) {
      return c.json({ error: 'Widget already blacklisted' }, 409)
    }

    const [entry] = await db.insert(widgetBlacklist).values({
      sourceAccountId: body.sourceAccountId,
      widgetId: body.widgetId,
      widgetDomain: body.widgetDomain,
      externalCampaignId: body.externalCampaignId,
      reason: body.reason ?? 'Manual blacklist',
      autoBlacklisted: false,
    }).returning()

    return c.json({
      id: entry.id,
      sourceAccountId: entry.sourceAccountId,
      widgetId: entry.widgetId,
      widgetDomain: entry.widgetDomain,
      reason: entry.reason,
      createdAt: entry.createdAt,
    }, 201)
  })

  // Remove widget from blacklist
  .delete('/blacklist/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')

    // Get the blacklist entry
    const entries = await db.select().from(widgetBlacklist)
      .where(eq(widgetBlacklist.id, id))

    if (entries.length === 0) {
      return c.json({ error: 'Blacklist entry not found' }, 404)
    }

    const entry = entries[0]

    // Verify user owns the source account
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(and(
        eq(sourceAccounts.id, entry.sourceAccountId),
        eq(sourceAccounts.userId, userId)
      ))

    if (accounts.length === 0) {
      return c.json({ error: 'Blacklist entry not found' }, 404)
    }

    await db.delete(widgetBlacklist).where(eq(widgetBlacklist.id, id))

    return c.json({ success: true })
  })
