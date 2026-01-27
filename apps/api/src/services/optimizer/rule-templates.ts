import type { RuleCondition, CompoundCondition, RuleAction } from '@nativehub/shared'

/**
 * Pre-defined rule templates for Nutraceuticals optimization
 * Configured for: $220 Revenue, $120 Target CPA, $100 Margin
 *
 * Based on Outbrain OB Code best practices:
 * - Minimum spend threshold before actions (1-3x CPA)
 * - At least 2 conditions per rule (KPI + data volume)
 * - 7 day lookback for nutra (longer conversion window)
 *
 * Threshold Reference:
 * - Excellent: $60 (0.5x CPA) → +50% bid
 * - Good: $90 (0.75x CPA) → +25% bid
 * - Target: $120 (1.0x CPA) → +10% bid
 * - Bad: $180 (1.5x CPA) → -10% bid
 * - Critical: $240 (2.0x CPA) → -25% bid / blacklist
 * - Blacklist (no conv): $360 (3x CPA)
 */
export interface RuleTemplate {
  id: string
  name: string
  description: string
  category: 'blacklist' | 'bid' | 'pause' | 'alert'
  condition: RuleCondition | CompoundCondition
  action: RuleAction
  defaults: {
    spendThreshold?: number
    cpaMultiplier?: number
    bidAdjustment?: number
    clicksThreshold?: number
    ctrThreshold?: number
  }
}

// Default CPA target for nutra offers ($120)
const DEFAULT_TARGET_CPA = 120

export const RULE_TEMPLATES: Record<string, RuleTemplate> = {
  // ============================================
  // BLACKLIST RULES (Section/Widget blocking)
  // ============================================

  // Rule 1: Block sections with no conversions after 3x CPA spend ($360)
  blacklist_no_conv: {
    id: 'blacklist_no_conv',
    name: 'Blacklist - Sem Conversoes',
    description: 'Bloquear sections que gastaram 3x CPA ($360) sem nenhuma conversao',
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 360 }, // 3x $120 CPA
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'blacklist' },
    defaults: { spendThreshold: 360, cpaMultiplier: 3 },
  },

  // Rule 2: Block sections with critical CPA (2x target = $240)
  blacklist_high_cpa: {
    id: 'blacklist_high_cpa',
    name: 'Blacklist - CPA Critico',
    description: 'Bloquear sections com CPA > $240 (2x target) apos spend minimo',
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 240 }, // 2x CPA minimum spend
        { metric: 'conversions', operator: 'gte', value: 1 },
        { metric: 'cpa', operator: 'gt', value: 240 }, // 2x $120 target
      ],
    },
    action: { type: 'blacklist' },
    defaults: { spendThreshold: 240, cpaMultiplier: 2 },
  },

  // Rule 3: Block sections with suspicious high CTR (fraud/bots)
  blacklist_high_ctr_fraud: {
    id: 'blacklist_high_ctr_fraud',
    name: 'Blacklist - CTR Fraudulento',
    description: 'Bloquear sections com CTR > 15% sem conversoes - indica trafego de bots',
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'impressions', operator: 'gte', value: 1000 },
        { metric: 'ctr', operator: 'gt', value: 15 },
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'blacklist' },
    defaults: { ctrThreshold: 15 },
  },

  // Rule 4: Block sections with very low engagement
  blacklist_low_engagement: {
    id: 'blacklist_low_engagement',
    name: 'Blacklist - Baixo Engajamento',
    description: 'Bloquear sections com muitas impressoes mas poucos cliques',
    category: 'blacklist',
    condition: {
      and: [
        { metric: 'impressions', operator: 'gte', value: 10000 },
        { metric: 'clicks', operator: 'lt', value: 5 },
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'blacklist' },
    defaults: { ctrThreshold: 0.05 },
  },

  // ============================================
  // BID INCREASE RULES (Scale Winners)
  // ============================================

  // Rule 5: +50% bid for excellent CPA (< $60 = 50% of target)
  raise_bid_excellent: {
    id: 'raise_bid_excellent',
    name: 'Bid +50% - CPA Excelente',
    description: 'Aumentar bid 50% em sections com CPA < $60 (escalar agressivo)',
    category: 'bid',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 120 }, // 1x CPA min spend
        { metric: 'conversions', operator: 'gte', value: 2 },
        { metric: 'cpa', operator: 'lt', value: 60 }, // < 50% of target
      ],
    },
    action: { type: 'bid_increase', value: 50 },
    defaults: { spendThreshold: 120, cpaMultiplier: 0.5, bidAdjustment: 50 },
  },

  // Rule 6: +25% bid for good CPA ($60-90 = 50-75% of target)
  raise_bid_good_cpa: {
    id: 'raise_bid_good_cpa',
    name: 'Bid +25% - CPA Bom',
    description: 'Aumentar bid 25% em sections com CPA $60-90',
    category: 'bid',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 120 },
        { metric: 'conversions', operator: 'gte', value: 2 },
        { metric: 'cpa', operator: 'gte', value: 60 },
        { metric: 'cpa', operator: 'lt', value: 90 },
      ],
    },
    action: { type: 'bid_increase', value: 25 },
    defaults: { spendThreshold: 120, cpaMultiplier: 0.75, bidAdjustment: 25 },
  },

  // Rule 7: +10% bid for on-target CPA ($90-120 = 75-100% of target)
  raise_bid_decent: {
    id: 'raise_bid_decent',
    name: 'Bid +10% - CPA No Target',
    description: 'Aumentar bid 10% em sections com CPA $90-120 (no target)',
    category: 'bid',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 120 },
        { metric: 'conversions', operator: 'gte', value: 2 },
        { metric: 'cpa', operator: 'gte', value: 90 },
        { metric: 'cpa', operator: 'lte', value: 120 },
      ],
    },
    action: { type: 'bid_increase', value: 10 },
    defaults: { spendThreshold: 120, cpaMultiplier: 1.0, bidAdjustment: 10 },
  },

  // ============================================
  // BID DECREASE RULES (Reduce Losers)
  // ============================================

  // Rule 8: -10% bid for bad CPA ($120-180 = 100-150% of target)
  lower_bid_bad_cpa: {
    id: 'lower_bid_bad_cpa',
    name: 'Bid -10% - CPA Acima do Target',
    description: 'Reduzir bid 10% em sections com CPA $120-180',
    category: 'bid',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 120 },
        { metric: 'conversions', operator: 'gte', value: 1 },
        { metric: 'cpa', operator: 'gt', value: 120 },
        { metric: 'cpa', operator: 'lte', value: 180 },
      ],
    },
    action: { type: 'bid_decrease', value: 10 },
    defaults: { spendThreshold: 120, cpaMultiplier: 1.0, bidAdjustment: 10 },
  },

  // Rule 9: -25% bid for poor CPA ($180-240 = 150-200% of target)
  lower_bid_poor_cpa: {
    id: 'lower_bid_poor_cpa',
    name: 'Bid -25% - CPA Ruim',
    description: 'Reduzir bid 25% em sections com CPA $180-240',
    category: 'bid',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 180 },
        { metric: 'conversions', operator: 'gte', value: 1 },
        { metric: 'cpa', operator: 'gt', value: 180 },
        { metric: 'cpa', operator: 'lte', value: 240 },
      ],
    },
    action: { type: 'bid_decrease', value: 25 },
    defaults: { spendThreshold: 180, cpaMultiplier: 1.5, bidAdjustment: 25 },
  },

  // ============================================
  // CAMPAIGN PAUSE RULES (Protection)
  // ============================================

  // Rule 10: Pause bleeding campaigns ($500+ spend, 0 conversions)
  pause_bleeding: {
    id: 'pause_bleeding',
    name: 'Pausar - Campanha Sangrando',
    description: 'Pausar campanhas que gastaram $500+ sem nenhuma conversao',
    category: 'pause',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 500 },
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'pause' },
    defaults: { spendThreshold: 500 },
  },

  // Rule 11: Pause severely underperforming campaigns
  pause_severe_bleeding: {
    id: 'pause_severe_bleeding',
    name: 'Pausar - CPA Critico',
    description: 'Pausar campanhas com CPA > $300 (2.5x target) apos $600 spend',
    category: 'pause',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 600 },
        { metric: 'conversions', operator: 'gte', value: 1 },
        { metric: 'cpa', operator: 'gt', value: 300 }, // 2.5x target
      ],
    },
    action: { type: 'pause' },
    defaults: { cpaMultiplier: 2.5 },
  },

  // ============================================
  // ALERT RULES (WhatsApp/Email notifications)
  // ============================================

  // Rule 12: Alert when campaign is ready to scale
  alert_scale_opportunity: {
    id: 'alert_scale_opportunity',
    name: 'Alerta - Escalar Campanha',
    description: 'Notificar quando campanha tem CPA excelente e volume - pronta para escalar',
    category: 'alert',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 500 },
        { metric: 'conversions', operator: 'gte', value: 5 },
        { metric: 'cpa', operator: 'lte', value: 90 }, // <= 75% target
      ],
    },
    action: { type: 'alert', value: 'SCALE_OPPORTUNITY' },
    defaults: { cpaMultiplier: 0.75 },
  },

  // Rule 13: Alert when campaign is budget capped while performing well
  alert_budget_capped: {
    id: 'alert_budget_capped',
    name: 'Alerta - Budget Capped',
    description: 'Notificar quando campanha esta capped mas performando bem - aumentar budget',
    category: 'alert',
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 200 },
        { metric: 'conversions', operator: 'gte', value: 2 },
        { metric: 'cpa', operator: 'lte', value: 120 }, // at or below target
      ],
    },
    action: { type: 'alert', value: 'BUDGET_CAPPED' },
    defaults: { cpaMultiplier: 1.0 },
  },

  // Rule 14: Alert for fraud detection
  alert_fraud_detected: {
    id: 'alert_fraud_detected',
    name: 'Alerta - Fraude Detectada',
    description: 'Notificar quando detectar padrao de trafego fraudulento',
    category: 'alert',
    condition: {
      and: [
        { metric: 'impressions', operator: 'gte', value: 5000 },
        { metric: 'ctr', operator: 'gt', value: 20 },
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'alert', value: 'FRAUD_DETECTED' },
    defaults: { ctrThreshold: 20 },
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
 * Apply custom target CPA to template condition thresholds
 * Use this to adjust templates for different CPA targets
 *
 * @param condition - The rule condition to adjust
 * @param targetCpa - Your target CPA (default: $120)
 * @param template - The rule template with multipliers
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
      const ruleCond = cond as RuleCondition
      if (ruleCond.metric === 'cpa') {
        // Replace CPA threshold with targetCpa * multiplier
        ruleCond.value = targetCpa * (template.defaults.cpaMultiplier || 1)
      } else if (ruleCond.metric === 'spend' && template.defaults.spendThreshold) {
        // Adjust spend threshold proportionally if CPA changes
        const ratio = targetCpa / DEFAULT_TARGET_CPA
        ruleCond.value = Math.round(template.defaults.spendThreshold * ratio)
      }
    }
  }

  processCondition(result)
  return result
}

/**
 * Get recommended rules for nutra offers
 * Returns rules in priority order (most important first)
 */
export function getNutraRecommendedRules(): RuleTemplate[] {
  return [
    RULE_TEMPLATES.blacklist_high_ctr_fraud,  // 1. Block bots first
    RULE_TEMPLATES.pause_bleeding,             // 2. Stop bleeding campaigns
    RULE_TEMPLATES.blacklist_no_conv,          // 3. Block no-conversion sections
    RULE_TEMPLATES.blacklist_high_cpa,         // 4. Block high CPA sections
    RULE_TEMPLATES.lower_bid_poor_cpa,         // 5. Reduce poor performers
    RULE_TEMPLATES.lower_bid_bad_cpa,          // 6. Reduce bad performers
    RULE_TEMPLATES.raise_bid_excellent,        // 7. Scale excellent performers
    RULE_TEMPLATES.raise_bid_good_cpa,         // 8. Scale good performers
    RULE_TEMPLATES.raise_bid_decent,           // 9. Scale on-target performers
    RULE_TEMPLATES.alert_scale_opportunity,    // 10. Scale alerts
    RULE_TEMPLATES.alert_budget_capped,        // 11. Budget alerts
    RULE_TEMPLATES.alert_fraud_detected,       // 12. Fraud alerts
  ]
}
