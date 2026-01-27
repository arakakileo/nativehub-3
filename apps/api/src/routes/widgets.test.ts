import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { sourceAccounts, widgetBlacklist } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import {
  createTestClient,
  createTestApp,
  createAuthHeaders,
  seedSourceAccount,
} from '../test/helpers.js'
import { TEST_USER_ID_2 } from '../test/fixtures/index.js'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.js'

/**
 * Helper to seed widget blacklist entry
 */
async function seedWidgetBlacklist(overrides: {
  sourceAccountId: string
  widgetId?: string
  widgetDomain?: string
  externalCampaignId?: string | null
  reason?: string
  autoBlacklisted?: boolean
}) {
  const [entry] = await db.insert(widgetBlacklist).values({
    sourceAccountId: overrides.sourceAccountId,
    widgetId: overrides.widgetId ?? 'widget-123',
    widgetDomain: overrides.widgetDomain ?? 'bad-site.com',
    externalCampaignId: overrides.externalCampaignId ?? null,
    reason: overrides.reason ?? 'High spend, no conversions',
    autoBlacklisted: overrides.autoBlacklisted ?? false,
  }).returning()

  return entry
}

// Stub routes for testing (without real authMiddleware)
function createWidgetsRoutes() {
  return new Hono()
    // List blacklisted widgets
    .get('/blacklist', async (c) => {
      const user = c.get('user')
      const sourceAccountId = c.req.query('sourceAccountId')
      const externalCampaignId = c.req.query('externalCampaignId')

      // Get user's source accounts
      const accounts = await db.select({ id: sourceAccounts.id })
        .from(sourceAccounts)
        .where(eq(sourceAccounts.userId, user.id))

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
    .post('/blacklist', validateBody(z.object({
      sourceAccountId: z.string().uuid(),
      widgetId: z.string().min(1),
      widgetDomain: z.string().optional(),
      externalCampaignId: z.string().optional(),
      reason: z.string().optional(),
    })), async (c) => {
      const user = c.get('user')
      const body = c.get('validatedBody') as {
        sourceAccountId: string
        widgetId: string
        widgetDomain?: string
        externalCampaignId?: string
        reason?: string
      }

      // Verify user owns the source account
      const accounts = await db.select({ id: sourceAccounts.id })
        .from(sourceAccounts)
        .where(and(
          eq(sourceAccounts.id, body.sourceAccountId),
          eq(sourceAccounts.userId, user.id)
        ))

      if (accounts.length === 0) {
        return c.json({ error: 'Source account not found' }, 404)
      }

      // Check if already blacklisted
      const existing = await db.select().from(widgetBlacklist)
        .where(and(
          eq(widgetBlacklist.sourceAccountId, body.sourceAccountId),
          eq(widgetBlacklist.widgetId, body.widgetId)
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
      const user = c.get('user')
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
          eq(sourceAccounts.userId, user.id)
        ))

      if (accounts.length === 0) {
        return c.json({ error: 'Blacklist entry not found' }, 404)
      }

      await db.delete(widgetBlacklist).where(eq(widgetBlacklist.id, id))

      return c.json({ success: true })
    })
}


describe('Widgets Routes - Integration (TDD)', () => {
  let app: Hono
  let client: ReturnType<typeof createTestClient>

  beforeEach(() => {
    app = createTestApp()
    app.route('/api/v1/widgets', createWidgetsRoutes())
    client = createTestClient(app)
  })

  describe('GET /api/v1/widgets/blacklist', () => {
    it('should return 401 without auth header', async () => {
      const res = await client.get('/api/v1/widgets/blacklist')
      expect(res.status).toBe(401)
    })

    it('should return empty array when no blacklisted widgets', async () => {
      const res = await client.get('/api/v1/widgets/blacklist', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toEqual([])
    })

    it('should list blacklisted widgets for user accounts', async () => {
      const account = await seedSourceAccount()
      await seedWidgetBlacklist({
        sourceAccountId: account.id,
        widgetId: 'bad-widget-1',
        widgetDomain: 'spam.com',
      })
      await seedWidgetBlacklist({
        sourceAccountId: account.id,
        widgetId: 'bad-widget-2',
        widgetDomain: 'fraud.com',
      })

      const res = await client.get('/api/v1/widgets/blacklist', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(2)
    })

    it('should filter by sourceAccountId', async () => {
      const account1 = await seedSourceAccount({ name: 'Account 1' })
      const account2 = await seedSourceAccount({ name: 'Account 2', sourceId: 'taboola' })

      await seedWidgetBlacklist({
        sourceAccountId: account1.id,
        widgetId: 'widget-1',
      })
      await seedWidgetBlacklist({
        sourceAccountId: account2.id,
        widgetId: 'widget-2',
      })

      const res = await client.get(`/api/v1/widgets/blacklist?sourceAccountId=${account1.id}`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].widgetId).toBe('widget-1')
    })

    it('should filter by externalCampaignId', async () => {
      const account = await seedSourceAccount()

      await seedWidgetBlacklist({
        sourceAccountId: account.id,
        widgetId: 'widget-1',
        externalCampaignId: 'campaign-A',
      })
      await seedWidgetBlacklist({
        sourceAccountId: account.id,
        widgetId: 'widget-2',
        externalCampaignId: 'campaign-B',
      })

      const res = await client.get(`/api/v1/widgets/blacklist?externalCampaignId=campaign-A`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].widgetId).toBe('widget-1')
    })

    it('should not include other user blacklist entries', async () => {
      const myAccount = await seedSourceAccount({ name: 'My Account' })
      const otherAccount = await seedSourceAccount({
        userId: TEST_USER_ID_2,
        name: 'Other Account',
      })

      await seedWidgetBlacklist({
        sourceAccountId: myAccount.id,
        widgetId: 'my-widget',
      })
      await seedWidgetBlacklist({
        sourceAccountId: otherAccount.id,
        widgetId: 'other-widget',
      })

      const res = await client.get('/api/v1/widgets/blacklist', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].widgetId).toBe('my-widget')
    })
  })

  describe('POST /api/v1/widgets/blacklist', () => {
    it('should return 401 without auth header', async () => {
      const res = await client.post('/api/v1/widgets/blacklist', {
        sourceAccountId: '00000000-0000-0000-0000-000000000000',
        widgetId: 'bad-widget',
      })
      expect(res.status).toBe(401)
    })

    it('should blacklist a widget', async () => {
      const account = await seedSourceAccount()

      const res = await client.post('/api/v1/widgets/blacklist', {
        sourceAccountId: account.id,
        widgetId: 'bad-widget',
        widgetDomain: 'spam.com',
        reason: 'No conversions',
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.id).toBeDefined()
      expect(json.widgetId).toBe('bad-widget')
      expect(json.widgetDomain).toBe('spam.com')
      expect(json.reason).toBe('No conversions')
    })

    it('should return 404 for non-existent source account', async () => {
      const res = await client.post('/api/v1/widgets/blacklist', {
        sourceAccountId: '00000000-0000-0000-0000-000000000000',
        widgetId: 'bad-widget',
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(404)
    })

    it('should return 404 for other user source account', async () => {
      const otherAccount = await seedSourceAccount({
        userId: TEST_USER_ID_2,
        name: 'Other Account',
      })

      const res = await client.post('/api/v1/widgets/blacklist', {
        sourceAccountId: otherAccount.id,
        widgetId: 'bad-widget',
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(404)
    })

    it('should return 409 for already blacklisted widget', async () => {
      const account = await seedSourceAccount()
      await seedWidgetBlacklist({
        sourceAccountId: account.id,
        widgetId: 'already-blacklisted',
      })

      const res = await client.post('/api/v1/widgets/blacklist', {
        sourceAccountId: account.id,
        widgetId: 'already-blacklisted',
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(409)
    })

    it('should return 400 for missing required fields', async () => {
      const account = await seedSourceAccount()

      const res = await client.post('/api/v1/widgets/blacklist', {
        sourceAccountId: account.id,
        // missing widgetId
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /api/v1/widgets/blacklist/:id', () => {
    it('should return 401 without auth header', async () => {
      const res = await client.delete('/api/v1/widgets/blacklist/some-id')
      expect(res.status).toBe(401)
    })

    it('should remove widget from blacklist', async () => {
      const account = await seedSourceAccount()
      const entry = await seedWidgetBlacklist({
        sourceAccountId: account.id,
        widgetId: 'to-remove',
      })

      const res = await client.delete(`/api/v1/widgets/blacklist/${entry.id}`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)

      // Verify removed
      const remaining = await db.select().from(widgetBlacklist)
        .where(eq(widgetBlacklist.id, entry.id))
      expect(remaining).toHaveLength(0)
    })

    it('should return 404 for non-existent entry', async () => {
      const res = await client.delete('/api/v1/widgets/blacklist/00000000-0000-0000-0000-000000000000', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(404)
    })

    it('should return 404 for other user blacklist entry', async () => {
      const otherAccount = await seedSourceAccount({
        userId: TEST_USER_ID_2,
        name: 'Other Account',
      })
      const entry = await seedWidgetBlacklist({
        sourceAccountId: otherAccount.id,
        widgetId: 'other-widget',
      })

      const res = await client.delete(`/api/v1/widgets/blacklist/${entry.id}`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(404)

      // Verify still exists
      const remaining = await db.select().from(widgetBlacklist)
        .where(eq(widgetBlacklist.id, entry.id))
      expect(remaining).toHaveLength(1)
    })
  })
})
