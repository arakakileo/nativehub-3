/**
 * Custom Rule Builder Service (MVP)
 *
 * Allows users to create custom automation rules:
 * - Define conditions (metrics thresholds, time-based, compound)
 * - Define actions (pause, enable, adjust bid, notify)
 * - Validate rules before saving
 * - Execute rules on demand or via scheduler
 */

import { logger } from '../../lib/logger.js'

export type RuleConditionOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between'
export type RuleConditionMetric = 'spend' | 'cpa' | 'conversions' | 'clicks' | 'impressions' | 'ctr' | 'roas'
export type RuleActionType = 'pause' | 'enable' | 'adjust_bid' | 'notify' | 'tag'
export type RuleLogic = 'and' | 'or'
export type RuleStatus = 'active' | 'paused' | 'draft'

export interface RuleCondition {
  id: string
  metric: RuleConditionMetric
  operator: RuleConditionOperator
  value: number
  value2?: number // For 'between' operator
  timeframe: 'today' | 'yesterday' | 'last_3_days' | 'last_7_days' | 'last_14_days' | 'last_30_days'
}

export interface RuleAction {
  id: string
  type: RuleActionType
  params: {
    bidChangePercent?: number // For adjust_bid
    bidChangeAbsolute?: number // For adjust_bid
    notificationMessage?: string // For notify
    tag?: string // For tag
  }
}

export interface CustomRule {
  id: string
  name: string
  description: string
  sourceAccountId: string
  status: RuleStatus
  priority: number // Lower = higher priority
  conditions: RuleCondition[]
  conditionLogic: RuleLogic // How conditions combine
  actions: RuleAction[]
  schedule: {
    enabled: boolean
    cron?: string // e.g., '0 */6 * * *' (every 6 hours)
    timezone?: string
  }
  limits: {
    maxActionsPerDay: number
    cooldownMinutes: number // Min time between actions on same campaign
  }
  stats: {
    timesTriggered: number
    lastTriggeredAt: Date | null
    actionsExecuted: number
  }
  createdAt: Date
  updatedAt: Date
}

export interface RuleEvaluationContext {
  campaignId: string
  campaignName: string
  metrics: {
    spend: number
    cpa: number
    conversions: number
    clicks: number
    impressions: number
    ctr: number
    roas: number
  }
}

export interface RuleEvaluationResult {
  ruleId: string
  ruleName: string
  matched: boolean
  conditionResults: Array<{
    conditionId: string
    metric: RuleConditionMetric
    matched: boolean
    actualValue: number
    threshold: number
  }>
  actionsToExecute: RuleAction[]
}

export interface RuleValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Custom Rule Builder Service
 * MVP: In-memory storage (production would use database)
 */
export class RuleBuilderService {
  private rules: Map<string, CustomRule> = new Map()
  private actionCooldowns: Map<string, Date> = new Map() // campaignId_ruleId -> lastAction

  /**
   * Create a new custom rule
   */
  createRule(params: {
    name: string
    description: string
    sourceAccountId: string
    conditions: Omit<RuleCondition, 'id'>[]
    conditionLogic?: RuleLogic
    actions: Omit<RuleAction, 'id'>[]
    schedule?: CustomRule['schedule']
    limits?: Partial<CustomRule['limits']>
    priority?: number
  }): CustomRule {
    // Validate before creating
    const validation = this.validateRule({
      conditions: params.conditions,
      actions: params.actions,
    })

    if (!validation.valid) {
      throw new Error(`Invalid rule: ${validation.errors.join(', ')}`)
    }

    const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const rule: CustomRule = {
      id,
      name: params.name,
      description: params.description,
      sourceAccountId: params.sourceAccountId,
      status: 'draft',
      priority: params.priority ?? 100,
      conditions: params.conditions.map((c, i) => ({
        ...c,
        id: `cond_${i}`,
      })),
      conditionLogic: params.conditionLogic ?? 'and',
      actions: params.actions.map((a, i) => ({
        ...a,
        id: `action_${i}`,
      })),
      schedule: params.schedule ?? { enabled: false },
      limits: {
        maxActionsPerDay: params.limits?.maxActionsPerDay ?? 50,
        cooldownMinutes: params.limits?.cooldownMinutes ?? 60,
      },
      stats: {
        timesTriggered: 0,
        lastTriggeredAt: null,
        actionsExecuted: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    this.rules.set(id, rule)
    logger.info({ ruleId: id, name: params.name }, 'Custom rule created')

    return rule
  }

  /**
   * Validate rule configuration
   */
  validateRule(params: {
    conditions: Omit<RuleCondition, 'id'>[]
    actions: Omit<RuleAction, 'id'>[]
  }): RuleValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Validate conditions
    if (params.conditions.length === 0) {
      errors.push('At least one condition is required')
    }

    for (const condition of params.conditions) {
      if (!this.isValidMetric(condition.metric)) {
        errors.push(`Invalid metric: ${condition.metric}`)
      }

      if (!this.isValidOperator(condition.operator)) {
        errors.push(`Invalid operator: ${condition.operator}`)
      }

      if (condition.operator === 'between' && condition.value2 === undefined) {
        errors.push('Between operator requires value2')
      }

      if (condition.value < 0) {
        errors.push(`Condition value cannot be negative: ${condition.value}`)
      }

      if (condition.operator === 'between' && condition.value2 !== undefined) {
        if (condition.value >= condition.value2) {
          errors.push('For between operator, value must be less than value2')
        }
      }
    }

    // Validate actions
    if (params.actions.length === 0) {
      errors.push('At least one action is required')
    }

    for (const action of params.actions) {
      if (!this.isValidActionType(action.type)) {
        errors.push(`Invalid action type: ${action.type}`)
      }

      if (action.type === 'adjust_bid') {
        if (!action.params.bidChangePercent && !action.params.bidChangeAbsolute) {
          errors.push('adjust_bid action requires bidChangePercent or bidChangeAbsolute')
        }

        if (action.params.bidChangePercent !== undefined) {
          if (action.params.bidChangePercent < -100 || action.params.bidChangePercent > 100) {
            errors.push('bidChangePercent must be between -100 and 100')
          }
        }
      }

      if (action.type === 'notify' && !action.params.notificationMessage) {
        warnings.push('notify action without message will use default')
      }
    }

    // Warnings
    if (params.conditions.length > 5) {
      warnings.push('Rules with many conditions may be hard to understand')
    }

    const hasPauseAction = params.actions.some(a => a.type === 'pause')
    const hasEnableAction = params.actions.some(a => a.type === 'enable')
    if (hasPauseAction && hasEnableAction) {
      warnings.push('Rule has both pause and enable actions which may conflict')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  private isValidMetric(metric: string): metric is RuleConditionMetric {
    return ['spend', 'cpa', 'conversions', 'clicks', 'impressions', 'ctr', 'roas'].includes(metric)
  }

  private isValidOperator(operator: string): operator is RuleConditionOperator {
    return ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between'].includes(operator)
  }

  private isValidActionType(type: string): type is RuleActionType {
    return ['pause', 'enable', 'adjust_bid', 'notify', 'tag'].includes(type)
  }

  /**
   * Evaluate rule against campaign context
   */
  evaluateRule(rule: CustomRule, context: RuleEvaluationContext): RuleEvaluationResult {
    const conditionResults: RuleEvaluationResult['conditionResults'] = []

    for (const condition of rule.conditions) {
      const actualValue = context.metrics[condition.metric]
      const matched = this.evaluateCondition(condition, actualValue)

      conditionResults.push({
        conditionId: condition.id,
        metric: condition.metric,
        matched,
        actualValue,
        threshold: condition.value,
      })
    }

    // Determine overall match based on logic
    const overallMatch = rule.conditionLogic === 'and'
      ? conditionResults.every(r => r.matched)
      : conditionResults.some(r => r.matched)

    // Check cooldown
    const cooldownKey = `${context.campaignId}_${rule.id}`
    const lastAction = this.actionCooldowns.get(cooldownKey)
    const inCooldown = lastAction &&
      (Date.now() - lastAction.getTime()) < rule.limits.cooldownMinutes * 60 * 1000

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matched: overallMatch && !inCooldown,
      conditionResults,
      actionsToExecute: overallMatch && !inCooldown ? rule.actions : [],
    }
  }

  /**
   * Evaluate single condition
   */
  private evaluateCondition(condition: RuleCondition, actualValue: number): boolean {
    switch (condition.operator) {
      case 'gt':
        return actualValue > condition.value
      case 'gte':
        return actualValue >= condition.value
      case 'lt':
        return actualValue < condition.value
      case 'lte':
        return actualValue <= condition.value
      case 'eq':
        return actualValue === condition.value
      case 'neq':
        return actualValue !== condition.value
      case 'between':
        return actualValue >= condition.value && actualValue <= (condition.value2 ?? Infinity)
      default:
        return false
    }
  }

  /**
   * Record that a rule was triggered
   */
  recordTrigger(ruleId: string, campaignId: string): void {
    const rule = this.rules.get(ruleId)
    if (rule) {
      rule.stats.timesTriggered++
      rule.stats.lastTriggeredAt = new Date()
      rule.stats.actionsExecuted += rule.actions.length

      // Set cooldown
      this.actionCooldowns.set(`${campaignId}_${ruleId}`, new Date())
    }
  }

  /**
   * Update rule
   */
  updateRule(ruleId: string, updates: Partial<Pick<CustomRule,
    'name' | 'description' | 'status' | 'priority' | 'conditions' | 'conditionLogic' | 'actions' | 'schedule' | 'limits'
  >>): CustomRule {
    const rule = this.rules.get(ruleId)
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`)
    }

    // Validate if conditions or actions changed
    if (updates.conditions || updates.actions) {
      const validation = this.validateRule({
        conditions: updates.conditions ?? rule.conditions,
        actions: updates.actions ?? rule.actions,
      })

      if (!validation.valid) {
        throw new Error(`Invalid rule update: ${validation.errors.join(', ')}`)
      }
    }

    // Apply updates
    if (updates.name) rule.name = updates.name
    if (updates.description) rule.description = updates.description
    if (updates.status) rule.status = updates.status
    if (updates.priority !== undefined) rule.priority = updates.priority
    if (updates.conditions) {
      rule.conditions = updates.conditions.map((c, i) => ({
        ...c,
        id: c.id ?? `cond_${i}`,
      })) as RuleCondition[]
    }
    if (updates.conditionLogic) rule.conditionLogic = updates.conditionLogic
    if (updates.actions) {
      rule.actions = updates.actions.map((a, i) => ({
        ...a,
        id: a.id ?? `action_${i}`,
      })) as RuleAction[]
    }
    if (updates.schedule) rule.schedule = { ...rule.schedule, ...updates.schedule }
    if (updates.limits) rule.limits = { ...rule.limits, ...updates.limits }

    rule.updatedAt = new Date()

    logger.info({ ruleId }, 'Custom rule updated')
    return rule
  }

  /**
   * Activate rule
   */
  activateRule(ruleId: string): CustomRule {
    return this.updateRule(ruleId, { status: 'active' })
  }

  /**
   * Pause rule
   */
  pauseRule(ruleId: string): CustomRule {
    return this.updateRule(ruleId, { status: 'paused' })
  }

  /**
   * Get rule by ID
   */
  getRule(ruleId: string): CustomRule | null {
    return this.rules.get(ruleId) || null
  }

  /**
   * List rules for source account
   */
  listRules(sourceAccountId: string, status?: RuleStatus): CustomRule[] {
    return Array.from(this.rules.values())
      .filter(r => r.sourceAccountId === sourceAccountId)
      .filter(r => !status || r.status === status)
      .sort((a, b) => a.priority - b.priority)
  }

  /**
   * Get active rules for evaluation
   */
  getActiveRules(sourceAccountId: string): CustomRule[] {
    return this.listRules(sourceAccountId, 'active')
  }

  /**
   * Delete rule
   */
  deleteRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId)
    if (!rule) {
      return false
    }

    if (rule.status === 'active') {
      throw new Error('Cannot delete active rule. Pause it first.')
    }

    this.rules.delete(ruleId)
    logger.info({ ruleId }, 'Custom rule deleted')
    return true
  }

  /**
   * Clone an existing rule
   */
  cloneRule(ruleId: string, newName: string): CustomRule {
    const original = this.rules.get(ruleId)
    if (!original) {
      throw new Error(`Rule ${ruleId} not found`)
    }

    return this.createRule({
      name: newName,
      description: `Clone of ${original.name}`,
      sourceAccountId: original.sourceAccountId,
      conditions: original.conditions.map(({ id, ...c }) => c),
      conditionLogic: original.conditionLogic,
      actions: original.actions.map(({ id, ...a }) => a),
      schedule: { ...original.schedule, enabled: false },
      limits: { ...original.limits },
      priority: original.priority,
    })
  }

  /**
   * Get rule templates
   */
  getTemplates(): Array<{
    id: string
    name: string
    description: string
    conditions: Omit<RuleCondition, 'id'>[]
    actions: Omit<RuleAction, 'id'>[]
  }> {
    return [
      {
        id: 'template_pause_high_cpa',
        name: 'Pause High CPA Campaigns',
        description: 'Pause campaigns with CPA more than 2x target',
        conditions: [
          { metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' },
          { metric: 'conversions', operator: 'gte', value: 3, timeframe: 'last_7_days' },
        ],
        actions: [
          { type: 'pause', params: {} },
          { type: 'notify', params: { notificationMessage: 'Campaign paused due to high CPA' } },
        ],
      },
      {
        id: 'template_scale_winners',
        name: 'Scale Winning Campaigns',
        description: 'Increase bids for campaigns with low CPA',
        conditions: [
          { metric: 'cpa', operator: 'lt', value: 20, timeframe: 'last_7_days' },
          { metric: 'conversions', operator: 'gte', value: 5, timeframe: 'last_7_days' },
        ],
        actions: [
          { type: 'adjust_bid', params: { bidChangePercent: 20 } },
        ],
      },
      {
        id: 'template_stop_no_conversions',
        name: 'Stop Zero Conversion Campaigns',
        description: 'Pause campaigns with spend but no conversions',
        conditions: [
          { metric: 'spend', operator: 'gt', value: 100, timeframe: 'last_7_days' },
          { metric: 'conversions', operator: 'eq', value: 0, timeframe: 'last_7_days' },
        ],
        actions: [
          { type: 'pause', params: {} },
          { type: 'tag', params: { tag: 'zero_conversions' } },
        ],
      },
    ]
  }
}

// Singleton instance
export const ruleBuilderService = new RuleBuilderService()
