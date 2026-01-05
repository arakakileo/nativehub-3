import { Hono } from 'hono'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { validateBody } from '../middleware/validate.js'
import { db } from '../lib/db.js'
import { sourceAccounts, optimizerCampaigns, optimizerRules, optimizerActions } from '../db/schema.js'
import { optimizerService } from '../services/optimizer/index.js'

// Validation schemas
const CreateOptimizerCampaignSchema = z.object({
  sourceAccountId: z.string().uuid(),
  externalCampaignId: z.string().min(1),
  targetCpa: z.number().positive(),
  bidStrategy: z.enum(['target_cpa', 'maximize_conversions', 'manual']).optional(),
})

const UpdateOptimizerCampaignSchema = z.object({
  enabled: z.boolean().optional(),
  targetCpa: z.number().positive().optional(),
  bidStrategy: z.enum(['target_cpa', 'maximize_conversions', 'manual']).optional(),
})

// Note: sessionMiddleware is applied globally in index.ts for all /api/v1/* routes
export const optimizerRoutes = new Hono()
  // List optimizer campaigns for user
  .get('/campaigns', async (c) => {
    const userId = c.get('userId')

    // Get user's source accounts
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

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
    const userId = c.get('userId')
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
        eq(sourceAccounts.userId, userId)
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
  .post('/campaigns', validateBody(CreateOptimizerCampaignSchema), async (c) => {
    const userId = c.get('userId')
    const body = c.get('validatedBody') as z.infer<typeof CreateOptimizerCampaignSchema>

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
  .patch('/campaigns/:id', validateBody(UpdateOptimizerCampaignSchema), async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')
    const body = c.get('validatedBody') as z.infer<typeof UpdateOptimizerCampaignSchema>

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
        eq(sourceAccounts.userId, userId)
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
    const userId = c.get('userId')
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
        eq(sourceAccounts.userId, userId)
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

  // List all rules for user's optimizer campaigns
  .get('/rules', async (c) => {
    const userId = c.get('userId')

    // Get user's source accounts
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    if (accounts.length === 0) {
      return c.json({ data: [] })
    }

    const accountIds = accounts.map((a) => a.id)

    // Get optimizer campaigns for those accounts
    const campaigns = await db.select().from(optimizerCampaigns)

    const userCampaigns = campaigns.filter((c) =>
      accountIds.includes(c.sourceAccountId)
    )

    if (userCampaigns.length === 0) {
      return c.json({ data: [] })
    }

    // Get rules for those campaigns
    const campaignIds = userCampaigns.map((c) => c.id)
    const rules = await db.select().from(optimizerRules)

    const userRules = rules.filter((r) =>
      campaignIds.includes(r.optimizerCampaignId)
    )

    return c.json({
      data: userRules.map((r) => ({
        id: r.id,
        optimizerCampaignId: r.optimizerCampaignId,
        name: r.name,
        enabled: r.enabled,
        priority: r.priority,
        ruleType: r.ruleType,
        templateId: r.templateId,
        condition: r.condition,
        action: r.action,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    })
  })

  // Trigger manual optimization for a specific campaign
  .post('/campaigns/:id/run', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')

    // Verify campaign exists
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
        eq(sourceAccounts.userId, userId)
      ))

    if (accounts.length === 0) {
      return c.json({ error: 'Optimizer campaign not found' }, 404)
    }

    // Run optimization for this specific campaign
    const result = await optimizerService.optimizeCampaignSourceAware(id)

    return c.json({
      campaignId: id,
      actionsGenerated: result.actionsGenerated,
      actionsExecuted: result.actionsExecuted,
      actionsFailed: result.actionsFailed,
      skipped: result.skipped,
    })
  })

  // Trigger manual optimization run for all campaigns
  .post('/run', async (c) => {
    const userId = c.get('userId')

    // Get user's source accounts to verify they have campaigns
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    if (accounts.length === 0) {
      return c.json({ actionsCount: 0, campaignsProcessed: 0, errors: [] })
    }

    // Run optimization for all campaigns
    const result = await optimizerService.optimizeAll()

    return c.json({
      actionsCount: result.totalActions,
      campaignsProcessed: result.campaignsProcessed,
      errors: [],
    })
  })
