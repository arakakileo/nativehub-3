import { db } from '../../lib/db.js'
import { optimizerCampaigns, optimizerRules, optimizerActions, sourceAccounts } from '../../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { getAuthenticatedSource } from '../../traffic-sources/index.js'
import { RuleEngine, type WidgetData } from './rule-engine.js'
import { ActionExecutor } from './action-executor.js'
import { RULE_TEMPLATES } from './rule-templates.js'
import { logger } from '../../lib/logger.js'

/**
 * Optimizer Service - Manages optimization campaigns and rules
 */
class OptimizerService {
  private ruleEngine = new RuleEngine()
  private actionExecutor = new ActionExecutor()

  /**
   * Get or create optimizer campaign for a traffic source campaign
   */
  async getOrCreateOptimizerCampaign(
    sourceAccountId: string,
    externalCampaignId: string,
    targetCpa: number
  ) {
    // Try to find existing
    const [existing] = await db.select()
      .from(optimizerCampaigns)
      .where(and(
        eq(optimizerCampaigns.sourceAccountId, sourceAccountId),
        eq(optimizerCampaigns.externalCampaignId, externalCampaignId)
      ))

    if (existing) return existing

    // Create new with default rules
    const [campaign] = await db.insert(optimizerCampaigns).values({
      sourceAccountId,
      externalCampaignId,
      enabled: true,
      targetCpa: targetCpa.toString(),
      bidStrategy: 'target_cpa',
      bidStrategyConfig: {},
    }).returning()

    // Add default template rules
    await this.addDefaultRules(campaign.id)

    return campaign
  }

  /**
   * Add default template rules to an optimizer campaign
   */
  private async addDefaultRules(optimizerCampaignId: string): Promise<void> {
    const defaultTemplates = [
      'blacklist_no_conv',
      'blacklist_high_cpa',
      'raise_bid_good_cpa',
      'lower_bid_bad_cpa',
    ]

    for (const templateId of defaultTemplates) {
      const template = RULE_TEMPLATES[templateId]
      if (!template) continue

      await db.insert(optimizerRules).values({
        optimizerCampaignId,
        name: template.name,
        enabled: true,
        priority: defaultTemplates.indexOf(templateId) + 1,
        ruleType: 'template',
        templateId,
        condition: template.condition,
        action: template.action,
      })
    }
  }

  /**
   * Get rules for an optimizer campaign
   */
  async getRules(optimizerCampaignId: string) {
    return db.select()
      .from(optimizerRules)
      .where(eq(optimizerRules.optimizerCampaignId, optimizerCampaignId))
      .orderBy(optimizerRules.priority)
  }

  /**
   * Get recent actions for an optimizer campaign
   */
  async getRecentActions(optimizerCampaignId: string, limit = 50) {
    return db.select()
      .from(optimizerActions)
      .where(eq(optimizerActions.optimizerCampaignId, optimizerCampaignId))
      .orderBy(desc(optimizerActions.createdAt))
      .limit(limit)
  }

  /**
   * Run optimization for a single campaign
   */
  async optimizeCampaign(optimizerCampaignId: string): Promise<{ actionsGenerated: number; actionsExecuted: number }> {
    logger.info({ optimizerCampaignId }, 'Starting campaign optimization')

    // Get optimizer campaign with source account
    const [campaign] = await db.select()
      .from(optimizerCampaigns)
      .where(eq(optimizerCampaigns.id, optimizerCampaignId))

    if (!campaign || !campaign.enabled) {
      logger.info({ optimizerCampaignId }, 'Campaign not found or disabled')
      return { actionsGenerated: 0, actionsExecuted: 0 }
    }

    const targetCpa = parseFloat(campaign.targetCpa)

    // Get rules
    const rules = await this.getRules(optimizerCampaignId)
    if (rules.length === 0) {
      logger.info({ optimizerCampaignId }, 'No rules configured')
      return { actionsGenerated: 0, actionsExecuted: 0 }
    }

    // Get authenticated source and fetch widgets
    const source = await getAuthenticatedSource(campaign.sourceAccountId)
    const widgets = await source.getWidgets({ campaignId: campaign.externalCampaignId })

    // Convert to WidgetData format
    const widgetData: WidgetData[] = widgets.map((w) => ({
      id: w.id,
      externalId: w.externalId,
      name: w.name,
      domain: w.domain,
      enabled: w.enabled,
      metrics: w.metrics,
      currentBid: w.metrics.cpc, // Use current CPC as bid reference
    }))

    // Run rule engine
    const actions = this.ruleEngine.generateActions(rules, widgetData, targetCpa)

    if (actions.length === 0) {
      logger.info({ optimizerCampaignId }, 'No actions generated')
      return { actionsGenerated: 0, actionsExecuted: 0 }
    }

    // Execute actions
    const results = await this.actionExecutor.executeActions(
      actions,
      optimizerCampaignId,
      campaign.sourceAccountId,
      campaign.externalCampaignId
    )

    const executed = results.filter((r) => r.success).length

    logger.info(
      { optimizerCampaignId, actionsGenerated: actions.length, actionsExecuted: executed },
      'Campaign optimization complete'
    )

    return { actionsGenerated: actions.length, actionsExecuted: executed }
  }

  /**
   * Run optimization for all enabled campaigns
   */
  async optimizeAll(): Promise<{ campaignsProcessed: number; totalActions: number }> {
    logger.info('Starting optimization run for all campaigns')

    const campaigns = await db.select()
      .from(optimizerCampaigns)
      .where(eq(optimizerCampaigns.enabled, true))

    let totalActions = 0

    for (const campaign of campaigns) {
      try {
        const result = await this.optimizeCampaign(campaign.id)
        totalActions += result.actionsExecuted
      } catch (error) {
        logger.error(
          { optimizerCampaignId: campaign.id, error },
          'Failed to optimize campaign'
        )
      }
    }

    logger.info(
      { campaignsProcessed: campaigns.length, totalActions },
      'Optimization run complete'
    )

    return { campaignsProcessed: campaigns.length, totalActions }
  }
}

export const optimizerService = new OptimizerService()
