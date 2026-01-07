import type { RuleCondition, CompoundCondition, RuleAction } from '@nativehub/shared'

/**
 * Pre-defined rule templates for common optimization scenarios
 */
export interface RuleTemplate {
  id: string
  name: string
  description: string
  category: 'blacklist' | 'bid' | 'pause'
  condition: RuleCondition | CompoundCondition
  action: RuleAction
  defaults: {
    spendThreshold?: number
    cpaMultiplier?: number
    bidAdjustment?: number
  }
}

export const RULE_TEMPLATES: Record<string, RuleTemplate> = {
  // Blacklist widgets with high spend but no conversions
  blacklist_no_conv: {
    id: 'blacklist_no_conv',
    name: 'Blacklist - No Conversions',
    description: 'Block widgets that spent over threshold without any conversions',
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 200 },
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'blacklist' },
    defaults: { spendThreshold: 200 },
  },

  // Blacklist widgets with CPA way above target
  blacklist_high_cpa: {
    id: 'blacklist_high_cpa',
    name: 'Blacklist - High CPA',
    description: 'Block widgets with CPA more than 2x target CPA',
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 50 },
        { metric: 'conversions', operator: 'gte', value: 1 },
        { metric: 'cpa', operator: 'gt', value: 100 }, // Will be replaced with targetCpa * multiplier
      ],
    },
    action: { type: 'blacklist' },
    defaults: { spendThreshold: 50, cpaMultiplier: 2 },
  },

  // Raise bid on widgets with good CPA
  raise_bid_good_cpa: {
    id: 'raise_bid_good_cpa',
    name: 'Raise Bid - Good CPA',
    description: 'Increase bid by 10% on widgets with CPA below 80% of target',
    category: 'bid',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 20 },
        { metric: 'conversions', operator: 'gte', value: 2 },
        { metric: 'cpa', operator: 'lt', value: 40 }, // Will be replaced with targetCpa * 0.8
      ],
    },
    action: { type: 'bid_increase', value: 10 }, // 10% increase
    defaults: { spendThreshold: 20, cpaMultiplier: 0.8, bidAdjustment: 10 },
  },

  // Lower bid on widgets with mediocre CPA
  lower_bid_bad_cpa: {
    id: 'lower_bid_bad_cpa',
    name: 'Lower Bid - Bad CPA',
    description: 'Decrease bid by 15% on widgets with CPA 50% above target',
    category: 'bid',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 30 },
        { metric: 'conversions', operator: 'gte', value: 1 },
        { metric: 'cpa', operator: 'gt', value: 75 }, // Will be replaced with targetCpa * 1.5
      ],
    },
    action: { type: 'bid_decrease', value: 15 }, // 15% decrease
    defaults: { spendThreshold: 30, cpaMultiplier: 1.5, bidAdjustment: 15 },
  },

  // Pause bleeding campaigns
  pause_bleeding: {
    id: 'pause_bleeding',
    name: 'Pause - Bleeding',
    description: 'Pause campaigns spending over 3x target CPA with no recent conversions',
    category: 'pause',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 150 }, // Will be targetCpa * 3
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'pause' },
    defaults: { cpaMultiplier: 3 },
  },
}

/**
 * Get a rule template by ID
 */
export function getRuleTemplate(templateId: string): RuleTemplate | undefined {
  return RULE_TEMPLATES[templateId]
}

/**
 * Get all rule templates by category
 */
export function getRuleTemplatesByCategory(category: RuleTemplate['category']): RuleTemplate[] {
  return Object.values(RULE_TEMPLATES).filter((t) => t.category === category)
}

/**
 * Apply target CPA to template condition thresholds
 */
export function applyTargetCpaToCondition(
  condition: RuleCondition | CompoundCondition,
  targetCpa: number,
  template: RuleTemplate
): RuleCondition | CompoundCondition {
  // Deep clone the condition
  const result = JSON.parse(JSON.stringify(condition))

  function processCondition(cond: RuleCondition | CompoundCondition): void {
    if ('and' in cond || 'or' in cond) {
      const nested = 'and' in cond ? cond.and : cond.or
      nested?.forEach(processCondition)
    } else {
      // TypeScript now knows this is RuleCondition
      const ruleCond = cond as RuleCondition
      if (ruleCond.metric === 'cpa') {
        // Replace CPA threshold with targetCpa * multiplier
        ruleCond.value = targetCpa * (template.defaults.cpaMultiplier || 1)
      } else if (ruleCond.metric === 'spend' && template.id === 'pause_bleeding') {
        // For pause_bleeding, spend threshold is based on CPA
        ruleCond.value = targetCpa * (template.defaults.cpaMultiplier || 3)
      }
    }
  }

  processCondition(result)
  return result
}
