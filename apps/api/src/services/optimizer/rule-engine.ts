import type { RuleCondition, CompoundCondition, CampaignMetrics, OptimizerActionType } from '@nativehub/shared'
import type { OptimizerRule, OptimizerAction } from '../../db/schema.js'
import { getRuleTemplate, applyTargetCpaToCondition } from './rule-templates.js'
import { logger } from '../../lib/logger.js'

/**
 * Widget data for evaluation
 */
export interface WidgetData {
  id: string
  externalId: string
  name: string
  domain?: string
  enabled: boolean
  metrics: Partial<CampaignMetrics>
  currentBid?: number
}

/**
 * Generated action from rule evaluation
 */
export interface GeneratedAction {
  ruleId: string
  ruleName: string
  actionType: OptimizerActionType
  targetType: 'widget' | 'campaign'
  targetId: string
  targetName: string
  previousValue?: number
  newValue?: number
  reason: string
  metrics: Partial<CampaignMetrics>
  confidenceScore: number
}

/**
 * Rule Engine - Evaluates conditions and generates actions
 */
export class RuleEngine {
  /**
   * Evaluate a condition against metrics
   */
  evaluateCondition(
    condition: RuleCondition | CompoundCondition,
    metrics: Partial<CampaignMetrics & { spend: number }>
  ): boolean {
    // Compound condition (AND/OR)
    if ('and' in condition) {
      return condition.and!.every((c) => this.evaluateCondition(c, metrics))
    }
    if ('or' in condition) {
      return condition.or!.some((c) => this.evaluateCondition(c, metrics))
    }

    // Simple condition
    const cond = condition as RuleCondition
    const value = metrics[cond.metric as keyof typeof metrics]

    if (value === undefined) {
      return false
    }

    switch (cond.operator) {
      case 'gt':
        return value > cond.value
      case 'gte':
        return value >= cond.value
      case 'lt':
        return value < cond.value
      case 'lte':
        return value <= cond.value
      case 'eq':
        return value === cond.value
      case 'neq':
        return value !== cond.value
      default:
        return false
    }
  }

  /**
   * Generate actions for widgets based on rules
   */
  generateActions(
    rules: OptimizerRule[],
    widgets: WidgetData[],
    targetCpa: number
  ): GeneratedAction[] {
    const actions: GeneratedAction[] = []

    // Sort rules by priority (lower = higher priority)
    const sortedRules = [...rules]
      .filter((r) => r.enabled)
      .sort((a, b) => a.priority - b.priority)

    // Track which widgets have been acted upon
    const actedWidgets = new Set<string>()

    for (const rule of sortedRules) {
      let condition = rule.condition as RuleCondition | CompoundCondition | null

      // If template-based, get the template condition
      if (rule.ruleType === 'template' && rule.templateId) {
        const template = getRuleTemplate(rule.templateId)
        if (template) {
          condition = applyTargetCpaToCondition(template.condition, targetCpa, template)
        }
      }

      if (!condition) continue

      for (const widget of widgets) {
        // Skip if already acted upon (higher priority rule won)
        if (actedWidgets.has(widget.externalId)) continue

        // Skip disabled widgets for non-enable actions
        const action = rule.action as { type: OptimizerActionType; value?: number }
        if (!widget.enabled && action.type !== 'enable') continue

        // Evaluate condition
        const metrics = {
          ...widget.metrics,
          spend: widget.metrics.spend || 0,
        }

        if (this.evaluateCondition(condition, metrics)) {
          const generatedAction = this.createAction(rule, widget, action, targetCpa)
          if (generatedAction) {
            actions.push(generatedAction)
            actedWidgets.add(widget.externalId)
          }
        }
      }
    }

    logger.info(
      { rulesEvaluated: sortedRules.length, widgetsEvaluated: widgets.length, actionsGenerated: actions.length },
      'Rule evaluation complete'
    )

    return actions
  }

  private createAction(
    rule: OptimizerRule,
    widget: WidgetData,
    action: { type: OptimizerActionType; value?: number },
    targetCpa: number
  ): GeneratedAction | null {
    const metrics = widget.metrics

    switch (action.type) {
      case 'blacklist':
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          actionType: 'blacklist',
          targetType: 'widget',
          targetId: widget.externalId,
          targetName: widget.name,
          reason: this.generateReason(rule, widget, targetCpa),
          metrics: metrics,
          confidenceScore: this.calculateConfidence(metrics, targetCpa),
        }

      case 'bid_increase':
      case 'bid_decrease': {
        const currentBid = widget.currentBid || 0
        const adjustment = action.value || 10 // Default 10%
        const multiplier = action.type === 'bid_increase' ? 1 + adjustment / 100 : 1 - adjustment / 100
        const newBid = Math.round(currentBid * multiplier * 1000) / 1000

        return {
          ruleId: rule.id,
          ruleName: rule.name,
          actionType: action.type,
          targetType: 'widget',
          targetId: widget.externalId,
          targetName: widget.name,
          previousValue: currentBid,
          newValue: newBid,
          reason: this.generateReason(rule, widget, targetCpa),
          metrics: metrics,
          confidenceScore: this.calculateConfidence(metrics, targetCpa),
        }
      }

      case 'pause':
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          actionType: 'pause',
          targetType: 'widget',
          targetId: widget.externalId,
          targetName: widget.name,
          reason: this.generateReason(rule, widget, targetCpa),
          metrics: metrics,
          confidenceScore: this.calculateConfidence(metrics, targetCpa),
        }

      default:
        return null
    }
  }

  private generateReason(rule: OptimizerRule, widget: WidgetData, targetCpa: number): string {
    const metrics = widget.metrics
    const spend = metrics.spend?.toFixed(2) || '0'
    const conversions = metrics.conversions || 0
    const cpa = metrics.cpa?.toFixed(2) || 'N/A'

    switch (rule.templateId) {
      case 'blacklist_no_conv':
        return `Spent $${spend} with 0 conversions`
      case 'blacklist_high_cpa':
        return `CPA $${cpa} exceeds target $${targetCpa.toFixed(2)} by ${((metrics.cpa || 0) / targetCpa * 100 - 100).toFixed(0)}%`
      case 'raise_bid_good_cpa':
        return `CPA $${cpa} is ${(100 - (metrics.cpa || 0) / targetCpa * 100).toFixed(0)}% below target - increasing bid`
      case 'lower_bid_bad_cpa':
        return `CPA $${cpa} is ${((metrics.cpa || 0) / targetCpa * 100 - 100).toFixed(0)}% above target - decreasing bid`
      case 'pause_bleeding':
        return `Spent $${spend} (${(parseFloat(spend) / targetCpa).toFixed(1)}x target CPA) with no conversions`
      default:
        return `Rule "${rule.name}" triggered: $${spend} spent, ${conversions} conversions, CPA $${cpa}`
    }
  }

  private calculateConfidence(metrics: Partial<CampaignMetrics>, targetCpa: number): number {
    // Higher confidence with more data
    const spend = metrics.spend || 0
    const conversions = metrics.conversions || 0

    // Base confidence from spend
    const spendConfidence = Math.min(spend / (targetCpa * 3), 1) * 0.5

    // Additional confidence from conversions
    const convConfidence = Math.min(conversions / 5, 1) * 0.5

    return Math.round((spendConfidence + convConfidence) * 100) / 100
  }
}
