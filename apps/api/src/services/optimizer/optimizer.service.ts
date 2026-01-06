import { db } from '../../lib/db.js'
import { optimizerCampaigns, optimizerRules, optimizerActions, sourceAccounts } from '../../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { getAuthenticatedSource } from '../../traffic-sources/index.js'
import { RuleEngine, type WidgetData } from './rule-engine.js'
import { ActionExecutor } from './action-executor.js'
import { RULE_TEMPLATES } from './rule-templates.js'
import { logger } from '../../lib/logger.js'
// Source-aware components (Phase 2 & 3)
import { createOptimizerAdapter, hasOptimizerSupport } from './adapters/index.js'
import { SourceAwareRuleEngine, type RuleEngineContext } from './source-aware-rule-engine.js'
import { SourceAwareActionExecutor } from './source-aware-action-executor.js'
import { getTemplatesForSource } from './source-rule-templates.js'

/**
 * Optimizer execution mode configuration
 * Controls automation level and notification behavior
 */
export interface OptimizerMode {
  /** Execute actions without confirmation (full auto mode) */
  autoExecute: boolean
  /** Send notification for each action taken */
  alertOnAction: boolean
  /** Send notification on failures/errors */
  alertOnError: boolean
}

/** Default mode: full auto with alerts */
export const DEFAULT_OPTIMIZER_MODE: OptimizerMode = {
  autoExecute: true,
  alertOnAction: true,
  alertOnError: true,
}

/**
 * High-ticket offer configuration thresholds
 * For $40-100+ CPA offers
 */
export const HIGH_TICKET_CONFIG = {
  /** Pause at spend >= 2.5x CPA goal with 0 conversions */
  noConvPauseMultiplier: 2.5,
  /** Block at CPA > 3x goal */
  highCpaBlockMultiplier: 3,
  /** Re-enable after 7 days */
  reactivationCooldownDays: 7,
  /** 50% bid reduction on reactivation */
  reactivationBidReduction: 0.5,
}

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
        const result = await this.optimizeCampaignSourceAware(campaign.id)
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

  /**
   * Run source-aware optimization for a single campaign
   * Uses new adapters, rule engine, and action executor
   * @param optimizerCampaignId - Campaign ID to optimize
   * @param mode - Execution mode (auto/manual, alerts on/off)
   */
  async optimizeCampaignSourceAware(
    optimizerCampaignId: string,
    mode: OptimizerMode = DEFAULT_OPTIMIZER_MODE
  ): Promise<{
    actionsGenerated: number
    actionsExecuted: number
    actionsFailed: number
    skipped: number
  }> {
    logger.info({ optimizerCampaignId, mode }, 'Starting source-aware campaign optimization')

    // Get optimizer campaign with source account
    const campaign = await db.query.optimizerCampaigns.findFirst({
      where: eq(optimizerCampaigns.id, optimizerCampaignId),
    })

    if (!campaign || !campaign.enabled) {
      logger.info({ optimizerCampaignId }, 'Campaign not found or disabled')
      return { actionsGenerated: 0, actionsExecuted: 0, actionsFailed: 0, skipped: 0 }
    }

    // Get source account to determine source type
    const account = await db.query.sourceAccounts.findFirst({
      where: eq(sourceAccounts.id, campaign.sourceAccountId),
    })

    if (!account) {
      logger.error({ sourceAccountId: campaign.sourceAccountId }, 'Source account not found')
      return { actionsGenerated: 0, actionsExecuted: 0, actionsFailed: 0, skipped: 0 }
    }

    const sourceId = account.sourceId

    // Check if source has optimizer support
    if (!hasOptimizerSupport(sourceId)) {
      logger.warn({ sourceId }, 'Source does not have optimizer adapter support')
      // Fall back to legacy optimization
      const result = await this.optimizeCampaign(optimizerCampaignId)
      return { ...result, actionsFailed: 0, skipped: 0 }
    }

    const targetCpa = parseFloat(campaign.targetCpa)

    // Get authenticated source and create adapter
    const source = await getAuthenticatedSource(campaign.sourceAccountId)
    const adapter = createOptimizerAdapter(sourceId, source)
    const constraints = adapter.getConstraints()

    // Get date range for metrics (last 7 days for reliable data)
    const to = new Date()
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Fetch placements with metrics via adapter
    const placements = await adapter.getPlacementsWithMetrics({
      campaignId: campaign.externalCampaignId,
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
    })

    if (placements.length === 0) {
      logger.info({ optimizerCampaignId }, 'No placements found')
      return { actionsGenerated: 0, actionsExecuted: 0, actionsFailed: 0, skipped: 0 }
    }

    // Get rules for this campaign
    const rules = await this.getRules(optimizerCampaignId)
    if (rules.length === 0) {
      logger.info({ optimizerCampaignId }, 'No rules configured')
      return { actionsGenerated: 0, actionsExecuted: 0, actionsFailed: 0, skipped: 0 }
    }

    // Count currently blocked placements for block limit tracking
    const blockedCount = await this.getBlockedCount(campaign.sourceAccountId, campaign.externalCampaignId)

    // Create rule engine context
    const context: RuleEngineContext = {
      sourceId,
      targetCpa,
      constraints,
      lastDataUpdate: new Date(), // Fresh data from API
      currentBlockedCount: blockedCount,
    }

    // Generate actions using source-aware rule engine
    const sourceAwareEngine = new SourceAwareRuleEngine()
    const actions = sourceAwareEngine.generateActions(rules, placements, context)

    if (actions.length === 0) {
      logger.info({ optimizerCampaignId }, 'No actions generated')
      return { actionsGenerated: 0, actionsExecuted: 0, actionsFailed: 0, skipped: 0 }
    }

    // Execute actions using source-aware executor (if autoExecute enabled)
    const executor = new SourceAwareActionExecutor(
      adapter,
      optimizerCampaignId,
      campaign.externalCampaignId,
      campaign.sourceAccountId
    )

    let result: { summary: { success: number; failed: number; skipped: number } }

    if (mode.autoExecute) {
      result = await executor.executeBatch(actions, {
        stopOnFirstFailure: false,
        maxRetries: 3,
      })
    } else {
      // Manual mode: log actions without executing
      logger.info(
        { optimizerCampaignId, actionsCount: actions.length },
        'Manual mode - actions generated but not executed'
      )
      result = { summary: { success: 0, failed: 0, skipped: actions.length } }
    }

    logger.info(
      {
        optimizerCampaignId,
        sourceId,
        actionsGenerated: actions.length,
        actionsExecuted: result.summary.success,
        actionsFailed: result.summary.failed,
        skipped: result.summary.skipped,
      },
      'Source-aware campaign optimization complete'
    )

    // Update last run status
    await db
      .update(optimizerCampaigns)
      .set({
        lastRunAt: new Date(),
        lastRunStatus: result.summary.failed > 0 ? 'partial' : 'success',
        lastRunSummary: {
          actionsGenerated: actions.length,
          actionsExecuted: result.summary.success,
          actionsFailed: result.summary.failed,
          skipped: result.summary.skipped,
          placementsEvaluated: placements.length,
        },
      })
      .where(eq(optimizerCampaigns.id, optimizerCampaignId))

    return {
      actionsGenerated: actions.length,
      actionsExecuted: result.summary.success,
      actionsFailed: result.summary.failed,
      skipped: result.summary.skipped,
    }
  }

  /**
   * Get count of blocked placements for a campaign
   */
  private async getBlockedCount(sourceAccountId: string, externalCampaignId: string): Promise<number> {
    const { widgetBlacklist } = await import('../../db/schema.js')
    const result = await db
      .select()
      .from(widgetBlacklist)
      .where(
        and(
          eq(widgetBlacklist.sourceAccountId, sourceAccountId),
          eq(widgetBlacklist.externalCampaignId, externalCampaignId)
        )
      )
    return result.length
  }

  /**
   * Add default source-specific template rules to an optimizer campaign
   */
  async addSourceAwareDefaultRules(optimizerCampaignId: string, sourceId: string): Promise<void> {
    const templates = getTemplatesForSource(sourceId)

    // Select key templates for defaults
    const defaultTemplateIds = [
      `${sourceId}_block_no_conv_spending`,
      `${sourceId}_block_high_cpa`,
      'universal_pause_bleeding',
    ]

    let priority = 1
    for (const templateId of defaultTemplateIds) {
      const template = templates.find((t) => t.id === templateId)
      if (!template) continue

      await db.insert(optimizerRules).values({
        optimizerCampaignId,
        name: template.name,
        enabled: true,
        priority: priority++,
        ruleType: 'template',
        templateId: template.id,
        condition: template.condition,
        action: template.action,
      })
    }

    logger.info({ optimizerCampaignId, sourceId, rulesAdded: priority - 1 }, 'Added source-aware default rules')
  }
}

export const optimizerService = new OptimizerService()
