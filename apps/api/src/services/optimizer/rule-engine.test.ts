import { describe, it, expect, vi } from 'vitest'
import { RuleEngine, type WidgetData } from './rule-engine'
import type { OptimizerRule } from '../../db/schema'

// Mock the logger
vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('RuleEngine', () => {
  const engine = new RuleEngine()

  describe('evaluateCondition', () => {
    it('should evaluate gt operator correctly', () => {
      const result = engine.evaluateCondition(
        { metric: 'spend', operator: 'gt', value: 50 },
        { spend: 60 }
      )
      expect(result).toBe(true)

      const result2 = engine.evaluateCondition(
        { metric: 'spend', operator: 'gt', value: 50 },
        { spend: 40 }
      )
      expect(result2).toBe(false)
    })

    it('should evaluate lte operator correctly', () => {
      const result = engine.evaluateCondition(
        { metric: 'conversions', operator: 'lte', value: 0 },
        { conversions: 0 }
      )
      expect(result).toBe(true)
    })

    it('should evaluate compound AND conditions', () => {
      const result = engine.evaluateCondition(
        {
          and: [
            { metric: 'spend', operator: 'gt', value: 50 },
            { metric: 'conversions', operator: 'eq', value: 0 },
          ],
        },
        { spend: 60, conversions: 0 }
      )
      expect(result).toBe(true)

      const result2 = engine.evaluateCondition(
        {
          and: [
            { metric: 'spend', operator: 'gt', value: 50 },
            { metric: 'conversions', operator: 'eq', value: 0 },
          ],
        },
        { spend: 60, conversions: 2 }
      )
      expect(result2).toBe(false)
    })

    it('should evaluate compound OR conditions', () => {
      const result = engine.evaluateCondition(
        {
          or: [
            { metric: 'spend', operator: 'gt', value: 100 },
            { metric: 'conversions', operator: 'gt', value: 5 },
          ],
        },
        { spend: 50, conversions: 10 }
      )
      expect(result).toBe(true)
    })

    it('should return false for missing metrics', () => {
      const result = engine.evaluateCondition(
        { metric: 'cpa', operator: 'gt', value: 10 },
        { spend: 60 } // cpa is missing
      )
      expect(result).toBe(false)
    })
  })

  describe('generateActions', () => {
    const createMockRule = (overrides: Partial<OptimizerRule> = {}): OptimizerRule => ({
      id: 'rule-1',
      optimizerCampaignId: 'campaign-1',
      name: 'Test Rule',
      ruleType: 'custom',
      templateId: null,
      condition: { metric: 'spend', operator: 'gt', value: 50 },
      action: { type: 'blacklist' },
      enabled: true,
      priority: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    })

    const createMockWidget = (overrides: Partial<WidgetData> = {}): WidgetData => ({
      id: 'widget-1',
      externalId: 'ext-widget-1',
      name: 'Test Widget',
      enabled: true,
      metrics: {
        spend: 60,
        clicks: 100,
        conversions: 0,
        impressions: 10000,
      },
      ...overrides,
    })

    it('should generate blacklist action for matching widget', () => {
      const rules = [
        createMockRule({
          condition: {
            and: [
              { metric: 'spend', operator: 'gt', value: 50 },
              { metric: 'conversions', operator: 'eq', value: 0 },
            ],
          },
          action: { type: 'blacklist' },
        }),
      ]

      const widgets = [
        createMockWidget({ metrics: { spend: 60, conversions: 0 } }),
      ]

      const actions = engine.generateActions(rules, widgets, 10)

      expect(actions).toHaveLength(1)
      expect(actions[0].actionType).toBe('blacklist')
      expect(actions[0].targetId).toBe('ext-widget-1')
    })

    it('should not generate action for non-matching widget', () => {
      const rules = [
        createMockRule({
          condition: { metric: 'spend', operator: 'gt', value: 100 },
          action: { type: 'blacklist' },
        }),
      ]

      const widgets = [
        createMockWidget({ metrics: { spend: 50 } }),
      ]

      const actions = engine.generateActions(rules, widgets, 10)

      expect(actions).toHaveLength(0)
    })

    it('should skip disabled rules', () => {
      const rules = [
        createMockRule({
          enabled: false,
          condition: { metric: 'spend', operator: 'gt', value: 0 },
          action: { type: 'blacklist' },
        }),
      ]

      const widgets = [
        createMockWidget({ metrics: { spend: 100 } }),
      ]

      const actions = engine.generateActions(rules, widgets, 10)

      expect(actions).toHaveLength(0)
    })

    it('should respect rule priority (lower = higher priority)', () => {
      const rules = [
        createMockRule({
          id: 'rule-low-priority',
          priority: 10,
          condition: { metric: 'spend', operator: 'gt', value: 0 },
          action: { type: 'pause' },
        }),
        createMockRule({
          id: 'rule-high-priority',
          priority: 1,
          condition: { metric: 'spend', operator: 'gt', value: 0 },
          action: { type: 'blacklist' },
        }),
      ]

      const widgets = [createMockWidget()]

      const actions = engine.generateActions(rules, widgets, 10)

      expect(actions).toHaveLength(1)
      expect(actions[0].ruleId).toBe('rule-high-priority')
      expect(actions[0].actionType).toBe('blacklist')
    })

    it('should generate bid_increase action with new value', () => {
      const rules = [
        createMockRule({
          condition: { metric: 'conversions', operator: 'gt', value: 5 },
          action: { type: 'bid_increase', value: 10 },
        }),
      ]

      const widgets = [
        createMockWidget({
          currentBid: 0.10,
          metrics: { conversions: 10 },
        }),
      ]

      const actions = engine.generateActions(rules, widgets, 10)

      expect(actions).toHaveLength(1)
      expect(actions[0].actionType).toBe('bid_increase')
      expect(actions[0].previousValue).toBe(0.10)
      expect(actions[0].newValue).toBe(0.11) // 10% increase
    })
  })
})
