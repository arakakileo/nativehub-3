/**
 * Source-Aware Rule Engine
 *
 * Extends base rule evaluation with source-specific context:
 * - Constraint enforcement (block limits, min thresholds)
 * - Reporting delay freshness checks
 * - Dynamic threshold resolution (targetCpa * X)
 * - Source-specific template application
 */

import type { RuleCondition, CompoundCondition, OptimizerActionType } from '@nativehub/shared'
import type { OptimizerRule } from '../../db/schema.js'
import type { PlacementMetrics, SourceConstraints } from './adapters/interface.js'
import type { SourceRuleTemplate } from './source-rule-templates.js'
import { getSourceTemplate, applyTargetCpaToSourceCondition } from './source-rule-templates.js'
import { logger } from '../../lib/logger.js'

/**
 * Context for source-aware rule evaluation
 */
export interface RuleEngineContext {
  /** Source identifier (outbrain, taboola, mgid, revcontent) */
  sourceId: string
  /** Target CPA for dynamic threshold calculation */
  targetCpa: number
  /** Source-specific constraints */
  constraints: SourceConstraints
  /** When data was last updated (for freshness check) */
  lastDataUpdate?: Date
  /** Current count of blocked placements in this campaign */
  currentBlockedCount?: number
}

/**
 * Generated action from source-aware rule evaluation
 */
export interface SourceAwareAction {
  ruleId: string | null
  ruleName: string
  templateId?: string
  actionType: OptimizerActionType
  targetType: 'placement'
  placementId: string
  placementName: string
  previousValue?: number
  newValue?: number
  reason: string
  metrics: PlacementMetrics
  confidenceScore: number
  /** Whether action was skipped due to constraints */
  skipped?: boolean
  skipReason?: string
}

/**
 * Source-Aware Rule Engine
 *
 * Evaluates rules with full source context including:
 * - Block limits per source
 * - Reporting delay handling
 * - Dynamic CPA thresholds
 */
export class SourceAwareRuleEngine {
  /**
   * Evaluate rules against placements with source context
   */
  generateActions(
    rules: OptimizerRule[],
    placements: PlacementMetrics[],
    context: RuleEngineContext
  ): SourceAwareAction[] {
    const { constraints, currentBlockedCount = 0 } = context

    // Filter placements that meet minimum data threshold
    const eligiblePlacements = placements.filter((p) => this.meetsMinimumThreshold(p, constraints))

    logger.debug(
      {
        sourceId: context.sourceId,
        totalPlacements: placements.length,
        eligiblePlacements: eligiblePlacements.length,
        rulesCount: rules.length,
      },
      'Starting source-aware rule evaluation'
    )

    // Track blocking actions for limit enforcement
    let blockedCount = currentBlockedCount
    const maxBlocks = constraints.maxBlocksPerCampaign

    const actions: SourceAwareAction[] = []
    const actedPlacements = new Set<string>()

    // Sort rules by priority (lower = higher priority)
    const sortedRules = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority)

    for (const rule of sortedRules) {
      // Get condition - from template or direct
      const condition = this.getConditionForRule(rule, context)
      if (!condition) continue

      for (const placement of eligiblePlacements) {
        // Skip if already acted upon by higher priority rule
        if (actedPlacements.has(placement.id)) continue

        // Check data freshness for this placement
        if (!this.isDataFreshEnough(placement, context)) {
          continue
        }

        // Evaluate condition with context
        if (!this.evaluateConditionWithContext(condition, placement, context)) {
          continue
        }

        // Get action type
        const actionConfig = rule.action as { type: OptimizerActionType; value?: number }

        // Check block limit
        if (actionConfig.type === 'blacklist' && maxBlocks !== null) {
          if (blockedCount >= maxBlocks) {
            // Log skipped action
            actions.push(
              this.createSkippedAction(rule, placement, context, `Block limit reached (${maxBlocks})`)
            )
            continue
          }
        }

        // Check bid adjust support
        if (
          (actionConfig.type === 'bid_increase' || actionConfig.type === 'bid_decrease') &&
          !constraints.supportsDirectBidAdjust
        ) {
          actions.push(
            this.createSkippedAction(
              rule,
              placement,
              context,
              `Source ${context.sourceId} does not support placement-level bid adjustments`
            )
          )
          continue
        }

        // Create action
        const action = this.createAction(rule, placement, actionConfig, context)
        actions.push(action)
        actedPlacements.add(placement.id)

        if (actionConfig.type === 'blacklist') {
          blockedCount++
        }
      }
    }

    logger.info(
      {
        sourceId: context.sourceId,
        actionsGenerated: actions.filter((a) => !a.skipped).length,
        actionsSkipped: actions.filter((a) => a.skipped).length,
        blockedCount,
        maxBlocks,
      },
      'Source-aware rule evaluation complete'
    )

    return actions
  }

  /**
   * Get condition for a rule, applying source template if needed
   */
  private getConditionForRule(
    rule: OptimizerRule,
    context: RuleEngineContext
  ): RuleCondition | CompoundCondition | null {
    // If template-based, get and apply target CPA
    if (rule.ruleType === 'template' && rule.templateId) {
      const template = getSourceTemplate(rule.templateId)
      if (template) {
        return applyTargetCpaToSourceCondition(template.condition, context.targetCpa, template)
      }
    }

    // Use direct condition from rule
    return rule.condition as RuleCondition | CompoundCondition | null
  }

  /**
   * Evaluate condition with source context
   * Handles dynamic values like 'targetCpa * 2'
   */
  private evaluateConditionWithContext(
    condition: RuleCondition | CompoundCondition,
    placement: PlacementMetrics,
    context: RuleEngineContext
  ): boolean {
    // Compound condition (AND/OR)
    if ('and' in condition) {
      return condition.and!.every((c) => this.evaluateConditionWithContext(c, placement, context))
    }
    if ('or' in condition) {
      return condition.or!.some((c) => this.evaluateConditionWithContext(c, placement, context))
    }

    // Simple condition
    const cond = condition as RuleCondition
    const threshold = this.resolveThreshold(cond.value, context)
    const metricValue = this.getMetricValue(placement, cond.metric)

    if (metricValue === undefined) {
      return false
    }

    switch (cond.operator) {
      case 'gt':
        return metricValue > threshold
      case 'gte':
        return metricValue >= threshold
      case 'lt':
        return metricValue < threshold
      case 'lte':
        return metricValue <= threshold
      case 'eq':
        return metricValue === threshold
      case 'neq':
        return metricValue !== threshold
      default:
        return false
    }
  }

  /**
   * Resolve dynamic threshold values
   */
  private resolveThreshold(value: number | string, context: RuleEngineContext): number {
    if (typeof value === 'number') return value

    // Parse expressions like 'targetCpa * 2'
    const str = String(value)
    if (str.includes('targetCpa')) {
      const parts = str.split('*')
      const multiplier = parts[1] ? parseFloat(parts[1].trim()) : 1
      return context.targetCpa * multiplier
    }

    return parseFloat(str) || 0
  }

  /**
   * Get metric value from placement
   */
  private getMetricValue(placement: PlacementMetrics, metric: string): number | undefined {
    switch (metric) {
      case 'spend':
        return placement.spend
      case 'impressions':
        return placement.impressions
      case 'clicks':
        return placement.clicks
      case 'conversions':
        return placement.conversions
      case 'cpc':
        return placement.cpc
      case 'cpa':
        return placement.cpa
      case 'ctr':
        return placement.ctr
      default:
        // Check metadata for source-specific metrics
        return placement.metadata?.[metric] as number | undefined
    }
  }

  /**
   * Check if placement meets minimum data threshold
   */
  private meetsMinimumThreshold(placement: PlacementMetrics, constraints: SourceConstraints): boolean {
    // Must have some activity (spend or clicks)
    if (placement.spend <= 0 && placement.clicks <= 0) {
      return false
    }
    return true
  }

  /**
   * Check if data is fresh enough to act on
   * Considers source reporting delay
   */
  private isDataFreshEnough(placement: PlacementMetrics, context: RuleEngineContext): boolean {
    const { constraints, lastDataUpdate } = context

    // If no reporting delay, always act
    if (constraints.reportingDelayHours === 0) {
      return true
    }

    // If no last update time, be cautious
    if (!lastDataUpdate) {
      // Only act on high-confidence situations (high spend + 0 conversions)
      return placement.spend >= 100 && placement.conversions === 0
    }

    const hoursSinceUpdate = (Date.now() - lastDataUpdate.getTime()) / (1000 * 60 * 60)

    // Data has settled past reporting delay - safe to act
    if (hoursSinceUpdate >= constraints.reportingDelayHours) {
      return true
    }

    // Fresh data - only act on obvious cases
    // High spend with zero conversions is clearly problematic
    if (placement.spend >= 100 && placement.conversions === 0) {
      return true
    }

    return false
  }

  /**
   * Create action from rule match
   */
  private createAction(
    rule: OptimizerRule,
    placement: PlacementMetrics,
    actionConfig: { type: OptimizerActionType; value?: number },
    context: RuleEngineContext
  ): SourceAwareAction {
    const baseAction: SourceAwareAction = {
      ruleId: rule.id,
      ruleName: rule.name,
      templateId: rule.templateId ?? undefined,
      actionType: actionConfig.type,
      targetType: 'placement',
      placementId: placement.id,
      placementName: placement.name,
      reason: this.generateReason(rule, placement, context),
      metrics: placement,
      confidenceScore: this.calculateConfidence(placement, context),
    }

    // Add bid values if applicable
    if (actionConfig.type === 'bid_increase' || actionConfig.type === 'bid_decrease') {
      const currentBid = (placement.metadata?.currentBid as number) ?? 0
      const adjustment = actionConfig.value ?? 10
      const multiplier = actionConfig.type === 'bid_increase' ? 1 + adjustment / 100 : 1 - adjustment / 100
      baseAction.previousValue = currentBid
      baseAction.newValue = Math.round(currentBid * multiplier * 1000) / 1000
    }

    return baseAction
  }

  /**
   * Create skipped action (for logging/UI)
   */
  private createSkippedAction(
    rule: OptimizerRule,
    placement: PlacementMetrics,
    context: RuleEngineContext,
    skipReason: string
  ): SourceAwareAction {
    const actionConfig = rule.action as { type: OptimizerActionType; value?: number }
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      templateId: rule.templateId ?? undefined,
      actionType: actionConfig.type,
      targetType: 'placement',
      placementId: placement.id,
      placementName: placement.name,
      reason: this.generateReason(rule, placement, context),
      metrics: placement,
      confidenceScore: 0,
      skipped: true,
      skipReason,
    }
  }

  /**
   * Generate human-readable reason
   */
  private generateReason(rule: OptimizerRule, placement: PlacementMetrics, context: RuleEngineContext): string {
    const { spend, conversions, cpa } = placement
    const { targetCpa, constraints } = context
    const terminology = constraints.placementTerminology

    // Template-specific reasons
    if (rule.templateId?.includes('no_conv')) {
      return `${terminology} spent $${spend.toFixed(2)} with 0 conversions`
    }
    if (rule.templateId?.includes('high_cpa')) {
      const excess = ((cpa / targetCpa) * 100 - 100).toFixed(0)
      return `CPA $${cpa.toFixed(2)} exceeds target $${targetCpa.toFixed(2)} by ${excess}%`
    }
    if (rule.templateId?.includes('good_performer') || rule.templateId?.includes('good_cpa')) {
      const below = (100 - (cpa / targetCpa) * 100).toFixed(0)
      return `CPA $${cpa.toFixed(2)} is ${below}% below target - increasing bid`
    }
    if (rule.templateId?.includes('poor_performer') || rule.templateId?.includes('bad_cpa')) {
      const above = ((cpa / targetCpa) * 100 - 100).toFixed(0)
      return `CPA $${cpa.toFixed(2)} is ${above}% above target - decreasing bid`
    }
    if (rule.templateId?.includes('pause') || rule.templateId?.includes('bleeding')) {
      const multiple = (spend / targetCpa).toFixed(1)
      return `Spent $${spend.toFixed(2)} (${multiple}x target CPA) with no conversions`
    }

    // Generic reason
    return `Rule "${rule.name}" triggered: $${spend.toFixed(2)} spent, ${conversions} conversions, CPA $${cpa.toFixed(2)}`
  }

  /**
   * Calculate confidence score based on data quality
   */
  private calculateConfidence(placement: PlacementMetrics, context: RuleEngineContext): number {
    const { spend, conversions } = placement
    const { targetCpa } = context

    // Higher confidence with more spend
    const spendConfidence = Math.min(spend / (targetCpa * 3), 1) * 0.5

    // Higher confidence with more conversions
    const convConfidence = Math.min(conversions / 5, 1) * 0.5

    return Math.round((spendConfidence + convConfidence) * 100) / 100
  }
}

/** Singleton instance */
export const sourceAwareRuleEngine = new SourceAwareRuleEngine()
