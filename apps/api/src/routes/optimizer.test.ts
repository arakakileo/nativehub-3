import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { sourceAccounts, optimizerCampaigns, optimizerRules, optimizerActions } from '../db/schema.js'
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
 * Helper to seed optimizer campaign
 */
async function seedOptimizerCampaign(overrides: {
  sourceAccountId: string
  externalCampaignId?: string
  enabled?: boolean
  targetCpa?: string
  bidStrategy?: string
}) {
  const [campaign] = await db.insert(optimizerCampaigns).values({
    sourceAccountId: overrides.sourceAccountId,
    externalCampaignId: overrides.externalCampaignId ?? 'campaign-123',
    enabled: overrides.enabled ?? true,
    targetCpa: overrides.targetCpa ?? '10.00',
    bidStrategy: overrides.bidStrategy ?? 'target_cpa',
    bidStrategyConfig: {},
  }).returning()

  return campaign
}

/**
 * Helper to seed optimizer rule
 */
async function seedOptimizerRule(overrides: {
  optimizerCampaignId: string
  name?: string
  enabled?: boolean
  priority?: number
  ruleType?: string
  templateId?: string
  condition?: Record<string, unknown>
  action?: Record<string, unknown>
}) {
  const [rule] = await db.insert(optimizerRules).values({
    optimizerCampaignId: overrides.optimizerCampaignId,
    name: overrides.name ?? 'Test Rule',
    enabled: overrides.enabled ?? true,
    priority: overrides.priority ?? 10,
    ruleType: overrides.ruleType ?? 'template',
    templateId: overrides.templateId ?? 'blacklist_no_conv',
    condition: overrides.condition ?? { metric: 'spend', operator: 'gt', value: 50 },
    action: overrides.action ?? { type: 'blacklist' },
  }).returning()

  return rule
}

/**
 * Helper to seed optimizer action
 */
async function seedOptimizerAction(overrides: {
  optimizerCampaignId: string
  ruleId?: string | null
  actionType?: string
  targetType?: string
  targetId?: string
  targetName?: string
  reason?: string
  executed?: boolean
}) {
  const [action] = await db.insert(optimizerActions).values({
    optimizerCampaignId: overrides.optimizerCampaignId,
    ruleId: overrides.ruleId ?? null,
    actionType: overrides.actionType ?? 'blacklist',
    targetType: overrides.targetType ?? 'widget',
    targetId: overrides.targetId ?? 'widget-123',
    targetName: overrides.targetName ?? 'Bad Widget',
    reason: overrides.reason ?? 'High spend, no conversions',
    metrics: { spend: 100, conversions: 0 },
    confidenceScore: '0.9',
    executed: overrides.executed ?? true,
    executedAt: new Date(),
  }).returning()

  return action
}

// Stub routes for testing (without real authMiddleware)
function createOptimizerRoutes() {
  return new Hono()
    // List optimizer campaigns for user
    .get('/campaigns', async (c) => {
      const user = c.get('user')

      // Get user's source accounts
      const accounts = await db.select({ id: sourceAccounts.id })
        .from(sourceAccounts)
        .where(eq(sourceAccounts.userId, user.id))

      if (accounts.length === 0) {
        return c.json({ data: [] })
      }

      const accountIds = accounts.map((a) => a.id)

      const campaigns = await db.select().from(optimizerCampaigns)
        .orderBy(optimizerCampaigns.createdAt)

      const userCampaigns = campaigns.filter((c) => accountIds.includes(c.sourceAccountId))

      return c.json({
        data: userCampaigns.map((c) => ({
          id: c.id,
          sourceAccountId: c.sourceAccountId,
          externalCampaignId: c.externalCampaignId,
          enabled: c.enabled,
          targetCpa: parseFloat(c.targetCpa),
          bidStrategy: c.bidStrategy,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      })
    })
    // Get single optimizer campaign with rules
    .get('/campaigns/:id', async (c) => {
      const user = c.get('user')
      const id = c.req.param('id')

      const campaigns = await db.select().from(optimizerCampaigns)
        .where(eq(optimizerCampaigns.id, id))

      if (campaigns.length === 0) {
        return c.json({ error: 'Optimizer campaign not found' }, 404)
      }

      const campaign = campaigns[0]

      // Verify user owns the source account
      const accounts = await db.select({ id: sourceAccounts.id })
        .from(sourceAccounts)
        .where(and(
          eq(sourceAccounts.id, campaign.sourceAccountId),
          eq(sourceAccounts.userId, user.id)
        ))

      if (accounts.length === 0) {
        return c.json({ error: 'Optimizer campaign not found' }, 404)
      }

      // Get rules
      const rules = await db.select().from(optimizerRules)
        .where(eq(optimizerRules.optimizerCampaignId, id))

      return c.json({
        data: {
          id: campaign.id,
          sourceAccountId: campaign.sourceAccountId,
          externalCampaignId: campaign.externalCampaignId,
          enabled: campaign.enabled,
          targetCpa: parseFloat(campaign.targetCpa),
          bidStrategy: campaign.bidStrategy,
          bidStrategyConfig: campaign.bidStrategyConfig,
          customThresholds: campaign.customThresholds,
          rules: rules.map((r) => ({
            id: r.id,
            name: r.name,
            enabled: r.enabled,
            priority: r.priority,
            ruleType: r.ruleType,
            templateId: r.templateId,
            condition: r.condition,
            action: r.action,
          })),
          createdAt: campaign.createdAt,
          updatedAt: campaign.updatedAt,
        },
      })
    })
    // Create optimizer campaign
    .post('/campaigns', validateBody(z.object({
      sourceAccountId: z.string().uuid(),
      externalCampaignId: z.string().min(1),
      targetCpa: z.number().positive(),
      bidStrategy: z.enum(['target_cpa', 'maximize_conversions', 'manual']).optional(),
    })), async (c) => {
      const user = c.get('user')
      const body = c.get('validatedBody') as {
        sourceAccountId: string
        externalCampaignId: string
        targetCpa: number
        bidStrategy?: 'target_cpa' | 'maximize_conversions' | 'manual'
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

      // Check if already exists
      const existing = await db.select().from(optimizerCampaigns)
        .where(and(
          eq(optimizerCampaigns.sourceAccountId, body.sourceAccountId),
          eq(optimizerCampaigns.externalCampaignId, body.externalCampaignId)
        ))

      if (existing.length > 0) {
        return c.json({ error: 'Optimizer campaign already exists' }, 409)
      }

      const [campaign] = await db.insert(optimizerCampaigns).values({
        sourceAccountId: body.sourceAccountId,
        externalCampaignId: body.externalCampaignId,
        targetCpa: body.targetCpa.toString(),
        bidStrategy: body.bidStrategy ?? 'target_cpa',
        bidStrategyConfig: {},
      }).returning()

      return c.json({
        id: campaign.id,
        sourceAccountId: campaign.sourceAccountId,
        externalCampaignId: campaign.externalCampaignId,
        enabled: campaign.enabled,
        targetCpa: parseFloat(campaign.targetCpa),
        bidStrategy: campaign.bidStrategy,
        createdAt: campaign.createdAt,
      }, 201)
    })
    // Update optimizer campaign
    .patch('/campaigns/:id', validateBody(z.object({
      enabled: z.boolean().optional(),
      targetCpa: z.number().positive().optional(),
      bidStrategy: z.enum(['target_cpa', 'maximize_conversions', 'manual']).optional(),
    })), async (c) => {
      const user = c.get('user')
      const id = c.req.param('id')
      const body = c.get('validatedBody') as {
        enabled?: boolean
        targetCpa?: number
        bidStrategy?: 'target_cpa' | 'maximize_conversions' | 'manual'
      }

      const campaigns = await db.select().from(optimizerCampaigns)
        .where(eq(optimizerCampaigns.id, id))

      if (campaigns.length === 0) {
        return c.json({ error: 'Optimizer campaign not found' }, 404)
      }

      const campaign = campaigns[0]

      // Verify user owns the source account
      const accounts = await db.select({ id: sourceAccounts.id })
        .from(sourceAccounts)
        .where(and(
          eq(sourceAccounts.id, campaign.sourceAccountId),
          eq(sourceAccounts.userId, user.id)
        ))

      if (accounts.length === 0) {
        return c.json({ error: 'Optimizer campaign not found' }, 404)
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() }
      if (body.enabled !== undefined) updateData.enabled = body.enabled
      if (body.targetCpa !== undefined) updateData.targetCpa = body.targetCpa.toString()
      if (body.bidStrategy !== undefined) updateData.bidStrategy = body.bidStrategy

      const [updated] = await db.update(optimizerCampaigns)
        .set(updateData)
        .where(eq(optimizerCampaigns.id, id))
        .returning()

      return c.json({
        id: updated.id,
        enabled: updated.enabled,
        targetCpa: parseFloat(updated.targetCpa),
        bidStrategy: updated.bidStrategy,
        updatedAt: updated.updatedAt,
      })
    })
    // Get action history
    .get('/campaigns/:id/actions', async (c) => {
      const user = c.get('user')
      const id = c.req.param('id')
      const limit = parseInt(c.req.query('limit') || '50')

      const campaigns = await db.select().from(optimizerCampaigns)
        .where(eq(optimizerCampaigns.id, id))

      if (campaigns.length === 0) {
        return c.json({ error: 'Optimizer campaign not found' }, 404)
      }

      const campaign = campaigns[0]

      // Verify user owns the source account
      const accounts = await db.select({ id: sourceAccounts.id })
        .from(sourceAccounts)
        .where(and(
          eq(sourceAccounts.id, campaign.sourceAccountId),
          eq(sourceAccounts.userId, user.id)
        ))

      if (accounts.length === 0) {
        return c.json({ error: 'Optimizer campaign not found' }, 404)
      }

      const actions = await db.select().from(optimizerActions)
        .where(eq(optimizerActions.optimizerCampaignId, id))
        .orderBy(optimizerActions.createdAt)
        .limit(limit)

      return c.json({
        data: actions.map((a) => ({
          id: a.id,
          actionType: a.actionType,
          targetType: a.targetType,
          targetId: a.targetId,
          targetName: a.targetName,
          previousValue: a.previousValue ? parseFloat(a.previousValue) : null,
          newValue: a.newValue ? parseFloat(a.newValue) : null,
          reason: a.reason,
          metrics: a.metrics,
          confidenceScore: a.confidenceScore ? parseFloat(a.confidenceScore) : null,
          executed: a.executed,
          executedAt: a.executedAt,
          error: a.error,
          createdAt: a.createdAt,
        })),
      })
    })
}

describe('Optimizer Routes - Integration (TDD)', () => {
  let app: Hono
  let client: ReturnType<typeof createTestClient>

  beforeEach(() => {
    app = createTestApp()
    app.route('/api/v1/optimizer', createOptimizerRoutes())
    client = createTestClient(app)
  })

  describe('GET /api/v1/optimizer/campaigns', () => {
    it('should return 401 without auth header', async () => {
      const res = await client.get('/api/v1/optimizer/campaigns')
      expect(res.status).toBe(401)
    })

    it('should return empty array when no optimizer campaigns', async () => {
      const res = await client.get('/api/v1/optimizer/campaigns', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toEqual([])
    })

    it('should list optimizer campaigns for user', async () => {
      const account = await seedSourceAccount()
      await seedOptimizerCampaign({
        sourceAccountId: account.id,
        externalCampaignId: 'camp-1',
        targetCpa: '15.00',
      })
      await seedOptimizerCampaign({
        sourceAccountId: account.id,
        externalCampaignId: 'camp-2',
        targetCpa: '20.00',
      })

      const res = await client.get('/api/v1/optimizer/campaigns', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(2)
    })

    it('should not include other user campaigns', async () => {
      const myAccount = await seedSourceAccount({ name: 'My Account' })
      const otherAccount = await seedSourceAccount({
        userId: TEST_USER_ID_2,
        name: 'Other Account',
      })

      await seedOptimizerCampaign({
        sourceAccountId: myAccount.id,
        externalCampaignId: 'my-camp',
      })
      await seedOptimizerCampaign({
        sourceAccountId: otherAccount.id,
        externalCampaignId: 'other-camp',
      })

      const res = await client.get('/api/v1/optimizer/campaigns', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].externalCampaignId).toBe('my-camp')
    })
  })

  describe('GET /api/v1/optimizer/campaigns/:id', () => {
    it('should return 404 for non-existent campaign', async () => {
      const res = await client.get('/api/v1/optimizer/campaigns/00000000-0000-0000-0000-000000000000', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(404)
    })

    it('should return 404 for other user campaign', async () => {
      const otherAccount = await seedSourceAccount({
        userId: TEST_USER_ID_2,
        name: 'Other Account',
      })
      const campaign = await seedOptimizerCampaign({
        sourceAccountId: otherAccount.id,
      })

      const res = await client.get(`/api/v1/optimizer/campaigns/${campaign.id}`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(404)
    })

    it('should return campaign with rules', async () => {
      const account = await seedSourceAccount()
      const campaign = await seedOptimizerCampaign({
        sourceAccountId: account.id,
        targetCpa: '12.50',
      })
      await seedOptimizerRule({
        optimizerCampaignId: campaign.id,
        name: 'Blacklist No Conversions',
        templateId: 'blacklist_no_conv',
      })
      await seedOptimizerRule({
        optimizerCampaignId: campaign.id,
        name: 'Raise Bid Good CPA',
        templateId: 'raise_bid_good_cpa',
      })

      const res = await client.get(`/api/v1/optimizer/campaigns/${campaign.id}`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.targetCpa).toBe(12.5)
      expect(json.data.rules).toHaveLength(2)
      expect(json.data.rules.map((r: { name: string }) => r.name)).toContain('Blacklist No Conversions')
    })
  })

  describe('POST /api/v1/optimizer/campaigns', () => {
    it('should return 401 without auth header', async () => {
      const res = await client.post('/api/v1/optimizer/campaigns', {
        sourceAccountId: '00000000-0000-0000-0000-000000000000',
        externalCampaignId: 'camp-1',
        targetCpa: 10,
      })
      expect(res.status).toBe(401)
    })

    it('should create optimizer campaign', async () => {
      const account = await seedSourceAccount()

      const res = await client.post('/api/v1/optimizer/campaigns', {
        sourceAccountId: account.id,
        externalCampaignId: 'new-camp',
        targetCpa: 15.5,
        bidStrategy: 'target_cpa',
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.id).toBeDefined()
      expect(json.externalCampaignId).toBe('new-camp')
      expect(json.targetCpa).toBe(15.5)
      expect(json.enabled).toBe(true)
    })

    it('should return 404 for non-existent source account', async () => {
      const res = await client.post('/api/v1/optimizer/campaigns', {
        sourceAccountId: '00000000-0000-0000-0000-000000000000',
        externalCampaignId: 'camp-1',
        targetCpa: 10,
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(404)
    })

    it('should return 404 for other user source account', async () => {
      const otherAccount = await seedSourceAccount({
        userId: TEST_USER_ID_2,
        name: 'Other Account',
      })

      const res = await client.post('/api/v1/optimizer/campaigns', {
        sourceAccountId: otherAccount.id,
        externalCampaignId: 'camp-1',
        targetCpa: 10,
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(404)
    })

    it('should return 409 for duplicate campaign', async () => {
      const account = await seedSourceAccount()
      await seedOptimizerCampaign({
        sourceAccountId: account.id,
        externalCampaignId: 'existing-camp',
      })

      const res = await client.post('/api/v1/optimizer/campaigns', {
        sourceAccountId: account.id,
        externalCampaignId: 'existing-camp',
        targetCpa: 10,
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(409)
    })
  })

  describe('PATCH /api/v1/optimizer/campaigns/:id', () => {
    it('should return 401 without auth header', async () => {
      const res = await client.patch('/api/v1/optimizer/campaigns/some-id', {
        enabled: false,
      })
      expect(res.status).toBe(401)
    })

    it('should update optimizer campaign', async () => {
      const account = await seedSourceAccount()
      const campaign = await seedOptimizerCampaign({
        sourceAccountId: account.id,
        targetCpa: '10.00',
        enabled: true,
      })

      const res = await client.patch(`/api/v1/optimizer/campaigns/${campaign.id}`, {
        enabled: false,
        targetCpa: 15.0,
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.enabled).toBe(false)
      expect(json.targetCpa).toBe(15.0)
    })

    it('should return 404 for non-existent campaign', async () => {
      const res = await client.patch('/api/v1/optimizer/campaigns/00000000-0000-0000-0000-000000000000', {
        enabled: false,
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(404)
    })

    it('should return 404 for other user campaign', async () => {
      const otherAccount = await seedSourceAccount({
        userId: TEST_USER_ID_2,
        name: 'Other Account',
      })
      const campaign = await seedOptimizerCampaign({
        sourceAccountId: otherAccount.id,
      })

      const res = await client.patch(`/api/v1/optimizer/campaigns/${campaign.id}`, {
        enabled: false,
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/v1/optimizer/campaigns/:id/actions', () => {
    it('should return 404 for non-existent campaign', async () => {
      const res = await client.get('/api/v1/optimizer/campaigns/00000000-0000-0000-0000-000000000000/actions', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(404)
    })

    it('should return action history', async () => {
      const account = await seedSourceAccount()
      const campaign = await seedOptimizerCampaign({
        sourceAccountId: account.id,
      })
      await seedOptimizerAction({
        optimizerCampaignId: campaign.id,
        actionType: 'blacklist',
        targetId: 'widget-1',
        targetName: 'Bad Widget 1',
      })
      await seedOptimizerAction({
        optimizerCampaignId: campaign.id,
        actionType: 'bid_decrease',
        targetId: 'widget-2',
        targetName: 'Bad Widget 2',
      })

      const res = await client.get(`/api/v1/optimizer/campaigns/${campaign.id}/actions`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(2)
      expect(json.data[0].actionType).toBe('blacklist')
    })

    it('should return 404 for other user campaign', async () => {
      const otherAccount = await seedSourceAccount({
        userId: TEST_USER_ID_2,
        name: 'Other Account',
      })
      const campaign = await seedOptimizerCampaign({
        sourceAccountId: otherAccount.id,
      })

      const res = await client.get(`/api/v1/optimizer/campaigns/${campaign.id}/actions`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(404)
    })

    it('should respect limit parameter', async () => {
      const account = await seedSourceAccount()
      const campaign = await seedOptimizerCampaign({
        sourceAccountId: account.id,
      })

      // Create 5 actions
      for (let i = 0; i < 5; i++) {
        await seedOptimizerAction({
          optimizerCampaignId: campaign.id,
          targetId: `widget-${i}`,
        })
      }

      const res = await client.get(`/api/v1/optimizer/campaigns/${campaign.id}/actions?limit=3`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(3)
    })
  })
})
