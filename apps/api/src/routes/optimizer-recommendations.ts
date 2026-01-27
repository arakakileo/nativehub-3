/**
 * Bid Recommendations API Routes
 *
 * Endpoints for smart bid recommendations based on CPA analysis
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { validateBody } from '../middleware/validate.js'
import { db } from '../lib/db.js'
import { sourceAccounts, optimizerCampaigns } from '../db/schema.js'
import { bidRecommendationsService } from '../services/optimizer/index.js'
import { logger } from '../lib/logger.js'

// Validation schemas
const GetRecommendationsSchema = z.object({
  targetCpa: z.number().positive(),
  lookbackDays: z.number().int().min(1).max(30).optional(),
})

export const optimizerRecommendationsRoutes = new Hono()
  /**
   * Get bid recommendations for a campaign
   * POST /optimizer/recommendations/:campaignId
   */
  .post('/:campaignId', validateBody(GetRecommendationsSchema), async (c) => {
    const userId = c.get('userId')
    const campaignId = c.req.param('campaignId')
    const body = c.get('validatedBody') as z.infer<typeof GetRecommendationsSchema>

    // Get campaign and verify ownership
    const campaigns = await db.select().from(optimizerCampaigns)
      .where(eq(optimizerCampaigns.id, campaignId))

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

    try {
      const recommendations = await bidRecommendationsService.generateRecommendations({
        sourceAccountId: campaign.sourceAccountId,
        externalCampaignId: campaign.externalCampaignId,
        targetCpa: body.targetCpa,
        lookbackDays: body.lookbackDays,
      })

      const summary = bidRecommendationsService.summarizeRecommendations(recommendations)

      return c.json({
        campaignId,
        targetCpa: body.targetCpa,
        lookbackDays: body.lookbackDays ?? 7,
        recommendations,
        summary,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg, campaignId }, 'Failed to generate recommendations')
      return c.json({ error: 'Failed to generate recommendations' }, 500)
    }
  })

  /**
   * Get recommendations for all user's campaigns
   * POST /optimizer/recommendations
   */
  .post('/', validateBody(GetRecommendationsSchema), async (c) => {
    const userId = c.get('userId')
    const body = c.get('validatedBody') as z.infer<typeof GetRecommendationsSchema>

    // Get user's source accounts
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    if (accounts.length === 0) {
      return c.json({ recommendations: [], summary: { total: 0, increases: 0, decreases: 0, pauses: 0, highConfidence: 0 } })
    }

    const accountIds = accounts.map(a => a.id)

    // Get user's optimizer campaigns
    const campaigns = await db.select().from(optimizerCampaigns)

    const userCampaigns = campaigns.filter(c => accountIds.includes(c.sourceAccountId) && c.enabled)

    if (userCampaigns.length === 0) {
      return c.json({ recommendations: [], summary: { total: 0, increases: 0, decreases: 0, pauses: 0, highConfidence: 0 } })
    }

    try {
      const allRecommendations = []

      for (const campaign of userCampaigns) {
        const recommendations = await bidRecommendationsService.generateRecommendations({
          sourceAccountId: campaign.sourceAccountId,
          externalCampaignId: campaign.externalCampaignId,
          targetCpa: body.targetCpa,
          lookbackDays: body.lookbackDays,
        })

        allRecommendations.push(...recommendations.map(r => ({
          ...r,
          optimizerCampaignId: campaign.id,
        })))
      }

      const summary = bidRecommendationsService.summarizeRecommendations(allRecommendations)

      return c.json({
        targetCpa: body.targetCpa,
        lookbackDays: body.lookbackDays ?? 7,
        campaignsAnalyzed: userCampaigns.length,
        recommendations: allRecommendations,
        summary,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg }, 'Failed to generate bulk recommendations')
      return c.json({ error: 'Failed to generate recommendations' }, 500)
    }
  })
