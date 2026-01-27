/**
 * Source-Specific Rule Templates
 *
 * Pre-defined optimization rules tailored for each traffic source's
 * terminology, constraints, and best practices.
 *
 * Key differences per source:
 * - Outbrain: Publishers, max 30 blocks, 4h reporting delay, 400+ clicks threshold
 * - Taboola: Sites, max 1500 blocks, real-time data
 * - MGID: Widgets, no bid adjust (teaser-level only), quality factor support
 * - Revcontent: Widgets, per-widget bids
 */

import type { RuleCondition, CompoundCondition, RuleAction } from '@nativehub/shared'

/**
 * Source-specific rule template with applicable sources
 */
export interface SourceRuleTemplate {
  id: string
  name: string
  description: string
  /** Which sources this template applies to */
  applicableSources: string[]
  category: 'blacklist' | 'bid' | 'pause'
  condition: RuleCondition | CompoundCondition
  action: RuleAction
  priority: number
  defaults: {
    spendThreshold?: number
    cpaMultiplier?: number
    bidAdjustment?: number
    minClicks?: number
  }
}

// =============================================================================
// OUTBRAIN TEMPLATES
// Max 30 publisher blocks, 4h reporting delay, recommends 400+ clicks
// =============================================================================

export const OUTBRAIN_TEMPLATES: SourceRuleTemplate[] = [
  {
    id: 'outbrain_block_no_conv_spending',
    name: 'Block Publisher: Spending Without Conversions',
    description: 'Block publishers spending > $50 with zero conversions (considers 4h data delay)',
    applicableSources: ['outbrain'],
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 50 },
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'blacklist' },
    priority: 1,
    defaults: { spendThreshold: 50 },
  },
  {
    id: 'outbrain_block_high_cpa',
    name: 'Block Publisher: CPA > 2x Target',
    description: 'Block publishers with CPA exceeding 2x target CPA',
    applicableSources: ['outbrain'],
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 30 },
        { metric: 'conversions', operator: 'gte', value: 1 },
        { metric: 'cpa', operator: 'gt', value: 100 }, // Replaced with targetCpa * 2
      ],
    },
    action: { type: 'blacklist' },
    priority: 2,
    defaults: { spendThreshold: 30, cpaMultiplier: 2 },
  },
  {
    id: 'outbrain_raise_bid_good_performer',
    name: 'Raise Bid: Good CPA Publisher',
    description: 'Increase bid 10% for publishers with CPA < 0.8x target and 2+ conversions',
    applicableSources: ['outbrain'],
    category: 'bid',
    condition: {
      and: [
        { metric: 'conversions', operator: 'gte', value: 2 },
        { metric: 'cpa', operator: 'lt', value: 40 }, // Replaced with targetCpa * 0.8
      ],
    },
    action: { type: 'bid_increase', value: 10 },
    priority: 3,
    defaults: { cpaMultiplier: 0.8, bidAdjustment: 10 },
  },
  {
    id: 'outbrain_lower_bid_poor_performer',
    name: 'Lower Bid: Poor CPA Publisher',
    description: 'Decrease bid 15% for publishers with CPA > 1.5x target',
    applicableSources: ['outbrain'],
    category: 'bid',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 30 },
        { metric: 'conversions', operator: 'gte', value: 1 },
        { metric: 'cpa', operator: 'gt', value: 75 }, // Replaced with targetCpa * 1.5
      ],
    },
    action: { type: 'bid_decrease', value: 15 },
    priority: 4,
    defaults: { spendThreshold: 30, cpaMultiplier: 1.5, bidAdjustment: 15 },
  },
]

// =============================================================================
// TABOOLA TEMPLATES
// Max 1500 site blocks, real-time data, per-site bid modifiers
// =============================================================================

export const TABOOLA_TEMPLATES: SourceRuleTemplate[] = [
  {
    id: 'taboola_block_high_spend_no_conv',
    name: 'Block Site: High Spend No Conversions',
    description: 'Block sites spending > $100 with zero conversions',
    applicableSources: ['taboola'],
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 100 },
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'blacklist' },
    priority: 1,
    defaults: { spendThreshold: 100 },
  },
  {
    id: 'taboola_block_high_cpa',
    name: 'Block Site: CPA > 2x Target',
    description: 'Block sites with CPA exceeding 2x target CPA',
    applicableSources: ['taboola'],
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 50 },
        { metric: 'conversions', operator: 'gte', value: 1 },
        { metric: 'cpa', operator: 'gt', value: 100 }, // Replaced with targetCpa * 2
      ],
    },
    action: { type: 'blacklist' },
    priority: 2,
    defaults: { spendThreshold: 50, cpaMultiplier: 2 },
  },
  {
    id: 'taboola_raise_bid_good_performer',
    name: 'Raise Bid: Good CPA Site',
    description: 'Increase bid modifier 10% for sites with CPA < 0.8x target',
    applicableSources: ['taboola'],
    category: 'bid',
    condition: {
      and: [
        { metric: 'conversions', operator: 'gte', value: 2 },
        { metric: 'cpa', operator: 'lt', value: 40 }, // Replaced with targetCpa * 0.8
      ],
    },
    action: { type: 'bid_increase', value: 10 },
    priority: 3,
    defaults: { cpaMultiplier: 0.8, bidAdjustment: 10 },
  },
]

// =============================================================================
// MGID TEMPLATES
// Widgets, no campaign-level bid adjustments (teaser-level only), quality factor
// =============================================================================

export const MGID_TEMPLATES: SourceRuleTemplate[] = [
  {
    id: 'mgid_block_no_conv_spending',
    name: 'Block Widget: Spending Without Conversions',
    description: 'Block widgets spending > $30 with zero conversions',
    applicableSources: ['mgid'],
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 30 },
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'blacklist' },
    priority: 1,
    defaults: { spendThreshold: 30 },
  },
  {
    id: 'mgid_block_high_cpa',
    name: 'Block Widget: CPA > 2x Target',
    description: 'Block widgets with CPA exceeding 2x target CPA',
    applicableSources: ['mgid'],
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 20 },
        { metric: 'conversions', operator: 'gte', value: 1 },
        { metric: 'cpa', operator: 'gt', value: 100 }, // Replaced with targetCpa * 2
      ],
    },
    action: { type: 'blacklist' },
    priority: 2,
    defaults: { spendThreshold: 20, cpaMultiplier: 2 },
  },
  // Note: MGID does not support widget-level bid adjustments
  // Bids are adjusted at teaser (ad) level only
]

// =============================================================================
// REVCONTENT TEMPLATES
// Widgets (campaigns are "Boosts"), per-widget bid adjustments
// =============================================================================

export const REVCONTENT_TEMPLATES: SourceRuleTemplate[] = [
  {
    id: 'revcontent_block_no_conv_spending',
    name: 'Block Widget: Spending Without Conversions',
    description: 'Block widgets spending > $40 with zero conversions',
    applicableSources: ['revcontent'],
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 40 },
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'blacklist' },
    priority: 1,
    defaults: { spendThreshold: 40 },
  },
  {
    id: 'revcontent_block_high_cpa',
    name: 'Block Widget: CPA > 2x Target',
    description: 'Block widgets with CPA exceeding 2x target CPA',
    applicableSources: ['revcontent'],
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 30 },
        { metric: 'conversions', operator: 'gte', value: 1 },
        { metric: 'cpa', operator: 'gt', value: 100 }, // Replaced with targetCpa * 2
      ],
    },
    action: { type: 'blacklist' },
    priority: 2,
    defaults: { spendThreshold: 30, cpaMultiplier: 2 },
  },
  {
    id: 'revcontent_raise_bid_good_performer',
    name: 'Raise Bid: Good CPA Widget',
    description: 'Increase bid 10% for widgets with CPA < 0.8x target',
    applicableSources: ['revcontent'],
    category: 'bid',
    condition: {
      and: [
        { metric: 'conversions', operator: 'gte', value: 2 },
        { metric: 'cpa', operator: 'lt', value: 40 }, // Replaced with targetCpa * 0.8
      ],
    },
    action: { type: 'bid_increase', value: 10 },
    priority: 3,
    defaults: { cpaMultiplier: 0.8, bidAdjustment: 10 },
  },
]

// =============================================================================
// UNIVERSAL TEMPLATES (apply to all sources)
// =============================================================================

export const UNIVERSAL_TEMPLATES: SourceRuleTemplate[] = [
  {
    id: 'universal_pause_bleeding',
    name: 'Pause: Excessive Spend No Results',
    description: 'Pause placements spending > 3x target CPA with no conversions',
    applicableSources: ['outbrain', 'taboola', 'mgid', 'revcontent'],
    category: 'pause',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 150 }, // Replaced with targetCpa * 3
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'pause' },
    priority: 0, // Highest priority - stop the bleeding
    defaults: { cpaMultiplier: 3 },
  },
]

// =============================================================================
// HIGH-TICKET TEMPLATES ($40-100 CPA offers)
// More aggressive thresholds for high-value conversions
// =============================================================================

export const HIGH_TICKET_TEMPLATES: SourceRuleTemplate[] = [
  {
    id: 'universal_pause_no_conv_2_5x',
    name: 'Pause: No Conversions at 2.5x CPA',
    description: 'Pause widgets spending >= 2.5x target CPA with zero conversions',
    applicableSources: ['outbrain', 'taboola', 'mgid', 'revcontent'],
    category: 'pause',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 100 }, // Replaced: targetCpa * 2.5
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'pause' },
    priority: 0, // Highest - stop the bleeding
    defaults: { cpaMultiplier: 2.5 },
  },
  {
    id: 'universal_block_cpa_3x',
    name: 'Block: CPA > 3x Target',
    description: 'Block widgets with CPA exceeding 3x target (even with conversions)',
    applicableSources: ['outbrain', 'taboola', 'mgid', 'revcontent'],
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 50 },
        { metric: 'conversions', operator: 'gte', value: 1 },
        { metric: 'cpa', operator: 'gt', value: 150 }, // Replaced: targetCpa * 3
      ],
    },
    action: { type: 'blacklist' },
    priority: 1,
    defaults: { cpaMultiplier: 3 },
  },
  {
    id: 'universal_lower_bid_cpa_2x',
    name: 'Lower Bid: CPA > 2x Target',
    description: 'Decrease bid 20% for widgets with CPA exceeding 2x target',
    applicableSources: ['outbrain', 'taboola', 'revcontent'], // MGID no widget bid support
    category: 'bid',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 40 },
        { metric: 'conversions', operator: 'gte', value: 1 },
        { metric: 'cpa', operator: 'gt', value: 100 }, // Replaced: targetCpa * 2
      ],
    },
    action: { type: 'bid_decrease', value: 20 },
    priority: 2,
    defaults: { cpaMultiplier: 2, bidAdjustment: 20 },
  },
  {
    id: 'universal_raise_bid_good_performer',
    name: 'Raise Bid: Strong Performer',
    description: 'Increase bid 15% for widgets with CPA < 0.7x target and 3+ conversions',
    applicableSources: ['outbrain', 'taboola', 'revcontent'],
    category: 'bid',
    condition: {
      and: [
        { metric: 'conversions', operator: 'gte', value: 3 },
        { metric: 'cpa', operator: 'lt', value: 35 }, // Replaced: targetCpa * 0.7
      ],
    },
    action: { type: 'bid_increase', value: 15 },
    priority: 3,
    defaults: { cpaMultiplier: 0.7, bidAdjustment: 15 },
  },
]

// =============================================================================
// EXPORTS
// =============================================================================

/** All source templates combined */
export const ALL_SOURCE_TEMPLATES: SourceRuleTemplate[] = [
  ...UNIVERSAL_TEMPLATES,
  ...HIGH_TICKET_TEMPLATES,
  ...OUTBRAIN_TEMPLATES,
  ...TABOOLA_TEMPLATES,
  ...MGID_TEMPLATES,
  ...REVCONTENT_TEMPLATES,
]

/**
 * Get templates applicable to a specific source
 */
export function getTemplatesForSource(sourceId: string): SourceRuleTemplate[] {
  return ALL_SOURCE_TEMPLATES.filter(
    (t) => t.applicableSources.includes(sourceId) || t.applicableSources.includes('all')
  )
}

/**
 * Get a source template by ID
 */
export function getSourceTemplate(templateId: string): SourceRuleTemplate | undefined {
  return ALL_SOURCE_TEMPLATES.find((t) => t.id === templateId)
}

/**
 * Get templates by category for a source
 */
export function getSourceTemplatesByCategory(
  sourceId: string,
  category: SourceRuleTemplate['category']
): SourceRuleTemplate[] {
  return getTemplatesForSource(sourceId).filter((t) => t.category === category)
}

/**
 * Apply target CPA to template condition thresholds
 */
export function applyTargetCpaToSourceCondition(
  condition: RuleCondition | CompoundCondition,
  targetCpa: number,
  template: SourceRuleTemplate
): RuleCondition | CompoundCondition {
  // Deep clone the condition
  const result = JSON.parse(JSON.stringify(condition)) as RuleCondition | CompoundCondition

  function processCondition(cond: RuleCondition | CompoundCondition): void {
    if ('and' in cond || 'or' in cond) {
      const nested = 'and' in cond ? cond.and : cond.or
      nested?.forEach(processCondition)
    } else {
      const ruleCond = cond as RuleCondition
      if (ruleCond.metric === 'cpa' && template.defaults.cpaMultiplier) {
        ruleCond.value = targetCpa * template.defaults.cpaMultiplier
      } else if (ruleCond.metric === 'spend' && template.id.includes('pause')) {
        // For pause templates, spend threshold is based on CPA multiplier
        ruleCond.value = targetCpa * (template.defaults.cpaMultiplier ?? 3)
      }
    }
  }

  processCondition(result)
  return result
}
