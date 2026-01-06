/**
 * A/B Testing Experiments API Routes
 *
 * Endpoints for managing optimization strategy experiments
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { validateBody } from '../middleware/validate.js'
import { db } from '../lib/db.js'
import { sourceAccounts } from '../db/schema.js'
import { abTestingService } from '../services/optimizer/index.js'
import { logger } from '../lib/logger.js'

// Validation schemas
const CreateExperimentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  sourceAccountId: z.string().uuid(),
  variants: z.array(z.object({
    name: z.string().min(1).max(50),
    description: z.string().max(200).optional(),
    config: z.record(z.unknown()).optional(),
    weight: z.number().int().min(0).max(100),
  })).min(2).max(5),
})

export const optimizerExperimentsRoutes = new Hono()
  /**
   * List experiments for user's source accounts
   * GET /optimizer/experiments
   */
  .get('/', async (c) => {
    const userId = c.get('userId')

    // Get user's source accounts
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    if (accounts.length === 0) {
      return c.json({ experiments: [] })
    }

    // Get experiments for each account
    const allExperiments = []
    for (const account of accounts) {
      const experiments = abTestingService.listExperiments(account.id)
      allExperiments.push(...experiments.map(e => ({
        id: e.id,
        name: e.name,
        description: e.description,
        status: e.status,
        sourceAccountId: e.sourceAccountId,
        variantCount: e.variants.length,
        campaignCount: e.campaignAssignments.size,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        createdAt: e.createdAt,
      })))
    }

    return c.json({ experiments: allExperiments })
  })

  /**
   * Get experiment details
   * GET /optimizer/experiments/:id
   */
  .get('/:id', async (c) => {
    const userId = c.get('userId')
    const experimentId = c.req.param('id')

    const experiment = abTestingService.getExperiment(experimentId)
    if (!experiment) {
      return c.json({ error: 'Experiment not found' }, 404)
    }

    // Verify user owns the source account
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(experiment.sourceAccountId)) {
      return c.json({ error: 'Experiment not found' }, 404)
    }

    return c.json({
      id: experiment.id,
      name: experiment.name,
      description: experiment.description,
      status: experiment.status,
      sourceAccountId: experiment.sourceAccountId,
      variants: experiment.variants,
      campaignAssignments: Object.fromEntries(experiment.campaignAssignments),
      metrics: {
        byVariant: Object.fromEntries(experiment.metrics.byVariant),
        winner: experiment.metrics.winner,
        confidence: experiment.metrics.confidence,
      },
      startedAt: experiment.startedAt,
      endedAt: experiment.endedAt,
      createdAt: experiment.createdAt,
    })
  })

  /**
   * Create new experiment
   * POST /optimizer/experiments
   */
  .post('/', validateBody(CreateExperimentSchema), async (c) => {
    const userId = c.get('userId')
    const body = c.get('validatedBody') as z.infer<typeof CreateExperimentSchema>

    // Verify user owns the source account
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(body.sourceAccountId)) {
      return c.json({ error: 'Source account not found' }, 404)
    }

    try {
      const experiment = abTestingService.createExperiment({
        name: body.name,
        description: body.description ?? '',
        sourceAccountId: body.sourceAccountId,
        variants: body.variants.map(v => ({
          name: v.name,
          description: v.description ?? '',
          config: v.config ?? {},
          weight: v.weight,
        })),
      })

      logger.info({ experimentId: experiment.id, userId }, 'Experiment created via API')

      return c.json({
        id: experiment.id,
        name: experiment.name,
        status: experiment.status,
        variants: experiment.variants,
        createdAt: experiment.createdAt,
      }, 201)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg }, 'Failed to create experiment')
      return c.json({ error: errorMsg }, 400)
    }
  })

  /**
   * Start experiment
   * POST /optimizer/experiments/:id/start
   */
  .post('/:id/start', async (c) => {
    const userId = c.get('userId')
    const experimentId = c.req.param('id')

    const experiment = abTestingService.getExperiment(experimentId)
    if (!experiment) {
      return c.json({ error: 'Experiment not found' }, 404)
    }

    // Verify ownership
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(experiment.sourceAccountId)) {
      return c.json({ error: 'Experiment not found' }, 404)
    }

    try {
      const started = await abTestingService.startExperiment(experimentId)

      logger.info({ experimentId, userId }, 'Experiment started via API')

      return c.json({
        id: started.id,
        status: started.status,
        campaignAssignments: Object.fromEntries(started.campaignAssignments),
        startedAt: started.startedAt,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg, experimentId }, 'Failed to start experiment')
      return c.json({ error: errorMsg }, 400)
    }
  })

  /**
   * Pause experiment
   * POST /optimizer/experiments/:id/pause
   */
  .post('/:id/pause', async (c) => {
    const userId = c.get('userId')
    const experimentId = c.req.param('id')

    const experiment = abTestingService.getExperiment(experimentId)
    if (!experiment) {
      return c.json({ error: 'Experiment not found' }, 404)
    }

    // Verify ownership
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(experiment.sourceAccountId)) {
      return c.json({ error: 'Experiment not found' }, 404)
    }

    try {
      const paused = abTestingService.pauseExperiment(experimentId)
      return c.json({ id: paused.id, status: paused.status })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: errorMsg }, 400)
    }
  })

  /**
   * Stop experiment
   * POST /optimizer/experiments/:id/stop
   */
  .post('/:id/stop', async (c) => {
    const userId = c.get('userId')
    const experimentId = c.req.param('id')

    const experiment = abTestingService.getExperiment(experimentId)
    if (!experiment) {
      return c.json({ error: 'Experiment not found' }, 404)
    }

    // Verify ownership
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(experiment.sourceAccountId)) {
      return c.json({ error: 'Experiment not found' }, 404)
    }

    const stopped = abTestingService.stopExperiment(experimentId)
    return c.json({
      id: stopped.id,
      status: stopped.status,
      endedAt: stopped.endedAt,
    })
  })

  /**
   * Get experiment results
   * GET /optimizer/experiments/:id/results
   */
  .get('/:id/results', async (c) => {
    const userId = c.get('userId')
    const experimentId = c.req.param('id')

    const experiment = abTestingService.getExperiment(experimentId)
    if (!experiment) {
      return c.json({ error: 'Experiment not found' }, 404)
    }

    // Verify ownership
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(experiment.sourceAccountId)) {
      return c.json({ error: 'Experiment not found' }, 404)
    }

    try {
      const results = await abTestingService.calculateResults(experimentId)
      return c.json(results)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg, experimentId }, 'Failed to calculate results')
      return c.json({ error: 'Failed to calculate results' }, 500)
    }
  })

  /**
   * Delete experiment
   * DELETE /optimizer/experiments/:id
   */
  .delete('/:id', async (c) => {
    const userId = c.get('userId')
    const experimentId = c.req.param('id')

    const experiment = abTestingService.getExperiment(experimentId)
    if (!experiment) {
      return c.json({ error: 'Experiment not found' }, 404)
    }

    // Verify ownership
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(experiment.sourceAccountId)) {
      return c.json({ error: 'Experiment not found' }, 404)
    }

    try {
      abTestingService.deleteExperiment(experimentId)
      return c.json({ message: 'Experiment deleted' })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: errorMsg }, 400)
    }
  })
