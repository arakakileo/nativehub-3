/**
 * Custom Rule Builder API Routes
 *
 * Endpoints for creating and managing custom automation rules
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { validateBody } from '../middleware/validate.js'
import { db } from '../lib/db.js'
import { sourceAccounts } from '../db/schema.js'
import { ruleBuilderService } from '../services/optimizer/index.js'
import { logger } from '../lib/logger.js'

// Validation schemas
const RuleConditionSchema = z.object({
  metric: z.enum(['spend', 'cpa', 'conversions', 'clicks', 'impressions', 'ctr', 'roas']),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between']),
  value: z.number(),
  value2: z.number().optional(),
  timeframe: z.enum(['today', 'yesterday', 'last_3_days', 'last_7_days', 'last_14_days', 'last_30_days']),
})

const RuleActionSchema = z.object({
  type: z.enum(['pause', 'enable', 'adjust_bid', 'notify', 'tag']),
  params: z.object({
    bidChangePercent: z.number().min(-100).max(100).optional(),
    bidChangeAbsolute: z.number().optional(),
    notificationMessage: z.string().max(500).optional(),
    tag: z.string().max(50).optional(),
  }),
})

const CreateRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  sourceAccountId: z.string().uuid(),
  conditions: z.array(RuleConditionSchema).min(1).max(10),
  conditionLogic: z.enum(['and', 'or']).optional(),
  actions: z.array(RuleActionSchema).min(1).max(5),
  schedule: z.object({
    enabled: z.boolean(),
    cron: z.string().optional(),
    timezone: z.string().optional(),
  }).optional(),
  limits: z.object({
    maxActionsPerDay: z.number().int().min(1).max(1000).optional(),
    cooldownMinutes: z.number().int().min(1).max(1440).optional(),
  }).optional(),
  priority: z.number().int().min(1).max(1000).optional(),
})

const UpdateRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  conditions: z.array(RuleConditionSchema).min(1).max(10).optional(),
  conditionLogic: z.enum(['and', 'or']).optional(),
  actions: z.array(RuleActionSchema).min(1).max(5).optional(),
  schedule: z.object({
    enabled: z.boolean(),
    cron: z.string().optional(),
    timezone: z.string().optional(),
  }).optional(),
  limits: z.object({
    maxActionsPerDay: z.number().int().min(1).max(1000).optional(),
    cooldownMinutes: z.number().int().min(1).max(1440).optional(),
  }).optional(),
  priority: z.number().int().min(1).max(1000).optional(),
})

const ValidateRuleSchema = z.object({
  conditions: z.array(RuleConditionSchema).min(1),
  actions: z.array(RuleActionSchema).min(1),
})

export const optimizerCustomRulesRoutes = new Hono()
  /**
   * List custom rules for user's source accounts
   * GET /optimizer/custom-rules
   */
  .get('/', async (c) => {
    const userId = c.get('userId')
    const status = c.req.query('status') as 'active' | 'paused' | 'draft' | undefined

    // Get user's source accounts
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    if (accounts.length === 0) {
      return c.json({ rules: [] })
    }

    // Get rules for each account
    const allRules = []
    for (const account of accounts) {
      const rules = ruleBuilderService.listRules(account.id, status)
      allRules.push(...rules.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        status: r.status,
        priority: r.priority,
        sourceAccountId: r.sourceAccountId,
        conditionCount: r.conditions.length,
        actionCount: r.actions.length,
        conditionLogic: r.conditionLogic,
        stats: r.stats,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })))
    }

    // Sort by priority
    allRules.sort((a, b) => a.priority - b.priority)

    return c.json({ rules: allRules })
  })

  /**
   * Get rule details
   * GET /optimizer/custom-rules/:id
   */
  .get('/:id', async (c) => {
    const userId = c.get('userId')
    const ruleId = c.req.param('id')

    const rule = ruleBuilderService.getRule(ruleId)
    if (!rule) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    // Verify ownership
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(rule.sourceAccountId)) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    return c.json(rule)
  })

  /**
   * Create new custom rule
   * POST /optimizer/custom-rules
   */
  .post('/', validateBody(CreateRuleSchema), async (c) => {
    const userId = c.get('userId')
    const body = c.get('validatedBody') as z.infer<typeof CreateRuleSchema>

    // Verify user owns the source account
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(body.sourceAccountId)) {
      return c.json({ error: 'Source account not found' }, 404)
    }

    try {
      const rule = ruleBuilderService.createRule({
        name: body.name,
        description: body.description ?? '',
        sourceAccountId: body.sourceAccountId,
        conditions: body.conditions,
        conditionLogic: body.conditionLogic,
        actions: body.actions,
        schedule: body.schedule,
        limits: body.limits,
        priority: body.priority,
      })

      logger.info({ ruleId: rule.id, userId }, 'Custom rule created via API')

      return c.json(rule, 201)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg }, 'Failed to create custom rule')
      return c.json({ error: errorMsg }, 400)
    }
  })

  /**
   * Update custom rule
   * PATCH /optimizer/custom-rules/:id
   */
  .patch('/:id', validateBody(UpdateRuleSchema), async (c) => {
    const userId = c.get('userId')
    const ruleId = c.req.param('id')
    const body = c.get('validatedBody') as z.infer<typeof UpdateRuleSchema>

    const rule = ruleBuilderService.getRule(ruleId)
    if (!rule) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    // Verify ownership
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(rule.sourceAccountId)) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    try {
      const updated = ruleBuilderService.updateRule(ruleId, body)
      return c.json(updated)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: errorMsg }, 400)
    }
  })

  /**
   * Activate rule
   * POST /optimizer/custom-rules/:id/activate
   */
  .post('/:id/activate', async (c) => {
    const userId = c.get('userId')
    const ruleId = c.req.param('id')

    const rule = ruleBuilderService.getRule(ruleId)
    if (!rule) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    // Verify ownership
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(rule.sourceAccountId)) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    const activated = ruleBuilderService.activateRule(ruleId)
    logger.info({ ruleId, userId }, 'Custom rule activated via API')

    return c.json({ id: activated.id, status: activated.status })
  })

  /**
   * Pause rule
   * POST /optimizer/custom-rules/:id/pause
   */
  .post('/:id/pause', async (c) => {
    const userId = c.get('userId')
    const ruleId = c.req.param('id')

    const rule = ruleBuilderService.getRule(ruleId)
    if (!rule) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    // Verify ownership
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(rule.sourceAccountId)) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    const paused = ruleBuilderService.pauseRule(ruleId)
    return c.json({ id: paused.id, status: paused.status })
  })

  /**
   * Clone rule
   * POST /optimizer/custom-rules/:id/clone
   */
  .post('/:id/clone', async (c) => {
    const userId = c.get('userId')
    const ruleId = c.req.param('id')
    const { name } = await c.req.json<{ name: string }>()

    if (!name) {
      return c.json({ error: 'Name is required' }, 400)
    }

    const rule = ruleBuilderService.getRule(ruleId)
    if (!rule) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    // Verify ownership
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(rule.sourceAccountId)) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    try {
      const cloned = ruleBuilderService.cloneRule(ruleId, name)
      logger.info({ ruleId: cloned.id, originalRuleId: ruleId, userId }, 'Custom rule cloned via API')
      return c.json(cloned, 201)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: errorMsg }, 400)
    }
  })

  /**
   * Delete rule
   * DELETE /optimizer/custom-rules/:id
   */
  .delete('/:id', async (c) => {
    const userId = c.get('userId')
    const ruleId = c.req.param('id')

    const rule = ruleBuilderService.getRule(ruleId)
    if (!rule) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    // Verify ownership
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(rule.sourceAccountId)) {
      return c.json({ error: 'Rule not found' }, 404)
    }

    try {
      ruleBuilderService.deleteRule(ruleId)
      return c.json({ message: 'Rule deleted' })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: errorMsg }, 400)
    }
  })

  /**
   * Validate rule configuration (without saving)
   * POST /optimizer/custom-rules/validate
   */
  .post('/validate', validateBody(ValidateRuleSchema), async (c) => {
    const body = c.get('validatedBody') as z.infer<typeof ValidateRuleSchema>

    const result = ruleBuilderService.validateRule({
      conditions: body.conditions,
      actions: body.actions,
    })

    return c.json(result)
  })

  /**
   * Get rule templates
   * GET /optimizer/custom-rules/templates
   */
  .get('/templates', async (c) => {
    const templates = ruleBuilderService.getTemplates()
    return c.json({ templates })
  })
