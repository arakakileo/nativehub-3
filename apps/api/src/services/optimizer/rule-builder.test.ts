/**
 * Rule Builder Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RuleBuilderService } from './rule-builder.service.js'

// Mock dependencies
vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('RuleBuilderService', () => {
  let service: RuleBuilderService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new RuleBuilderService()
  })

  describe('createRule', () => {
    it('should create rule with valid configuration', () => {
      const rule = service.createRule({
        name: 'Pause High CPA',
        description: 'Pause campaigns with CPA > $50',
        sourceAccountId: 'account-1',
        conditions: [
          { metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' },
        ],
        actions: [
          { type: 'pause', params: {} },
        ],
      })

      expect(rule.id).toBeDefined()
      expect(rule.name).toBe('Pause High CPA')
      expect(rule.status).toBe('draft')
      expect(rule.conditions).toHaveLength(1)
      expect(rule.actions).toHaveLength(1)
      expect(rule.conditionLogic).toBe('and')
    })

    it('should throw for empty conditions', () => {
      expect(() => {
        service.createRule({
          name: 'Invalid Rule',
          description: 'Test',
          sourceAccountId: 'account-1',
          conditions: [],
          actions: [{ type: 'pause', params: {} }],
        })
      }).toThrow('At least one condition is required')
    })

    it('should throw for empty actions', () => {
      expect(() => {
        service.createRule({
          name: 'Invalid Rule',
          description: 'Test',
          sourceAccountId: 'account-1',
          conditions: [{ metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' }],
          actions: [],
        })
      }).toThrow('At least one action is required')
    })

    it('should throw for invalid metric', () => {
      expect(() => {
        service.createRule({
          name: 'Invalid Rule',
          description: 'Test',
          sourceAccountId: 'account-1',
          conditions: [{ metric: 'invalid' as any, operator: 'gt', value: 50, timeframe: 'last_7_days' }],
          actions: [{ type: 'pause', params: {} }],
        })
      }).toThrow('Invalid metric')
    })

    it('should throw for between operator without value2', () => {
      expect(() => {
        service.createRule({
          name: 'Invalid Rule',
          description: 'Test',
          sourceAccountId: 'account-1',
          conditions: [{ metric: 'cpa', operator: 'between', value: 10, timeframe: 'last_7_days' }],
          actions: [{ type: 'pause', params: {} }],
        })
      }).toThrow('Between operator requires value2')
    })

    it('should throw for adjust_bid without parameters', () => {
      expect(() => {
        service.createRule({
          name: 'Invalid Rule',
          description: 'Test',
          sourceAccountId: 'account-1',
          conditions: [{ metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' }],
          actions: [{ type: 'adjust_bid', params: {} }],
        })
      }).toThrow('adjust_bid action requires')
    })
  })

  describe('validateRule', () => {
    it('should return warnings for many conditions', () => {
      const result = service.validateRule({
        conditions: [
          { metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' },
          { metric: 'spend', operator: 'gt', value: 100, timeframe: 'last_7_days' },
          { metric: 'conversions', operator: 'lt', value: 5, timeframe: 'last_7_days' },
          { metric: 'ctr', operator: 'lt', value: 1, timeframe: 'last_7_days' },
          { metric: 'clicks', operator: 'gt', value: 100, timeframe: 'last_7_days' },
          { metric: 'impressions', operator: 'gt', value: 1000, timeframe: 'last_7_days' },
        ],
        actions: [{ type: 'pause', params: {} }],
      })

      expect(result.valid).toBe(true)
      expect(result.warnings).toContain('Rules with many conditions may be hard to understand')
    })

    it('should warn about conflicting pause and enable actions', () => {
      const result = service.validateRule({
        conditions: [{ metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' }],
        actions: [
          { type: 'pause', params: {} },
          { type: 'enable', params: {} },
        ],
      })

      expect(result.valid).toBe(true)
      expect(result.warnings).toContain('Rule has both pause and enable actions which may conflict')
    })
  })

  describe('evaluateRule', () => {
    it('should match when all conditions met (AND logic)', () => {
      const rule = service.createRule({
        name: 'Test Rule',
        description: 'Test',
        sourceAccountId: 'account-1',
        conditions: [
          { metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' },
          { metric: 'spend', operator: 'gt', value: 100, timeframe: 'last_7_days' },
        ],
        conditionLogic: 'and',
        actions: [{ type: 'pause', params: {} }],
      })

      const result = service.evaluateRule(rule, {
        campaignId: 'camp-1',
        campaignName: 'Test Campaign',
        metrics: { spend: 150, cpa: 60, conversions: 5, clicks: 100, impressions: 5000, ctr: 2, roas: 1.5 },
      })

      expect(result.matched).toBe(true)
      expect(result.actionsToExecute).toHaveLength(1)
    })

    it('should not match when one condition fails (AND logic)', () => {
      const rule = service.createRule({
        name: 'Test Rule',
        description: 'Test',
        sourceAccountId: 'account-1',
        conditions: [
          { metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' },
          { metric: 'spend', operator: 'gt', value: 100, timeframe: 'last_7_days' },
        ],
        conditionLogic: 'and',
        actions: [{ type: 'pause', params: {} }],
      })

      const result = service.evaluateRule(rule, {
        campaignId: 'camp-1',
        campaignName: 'Test Campaign',
        metrics: { spend: 50, cpa: 60, conversions: 5, clicks: 100, impressions: 5000, ctr: 2, roas: 1.5 },
      })

      expect(result.matched).toBe(false)
      expect(result.actionsToExecute).toHaveLength(0)
    })

    it('should match when any condition met (OR logic)', () => {
      const rule = service.createRule({
        name: 'Test Rule',
        description: 'Test',
        sourceAccountId: 'account-1',
        conditions: [
          { metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' },
          { metric: 'spend', operator: 'gt', value: 100, timeframe: 'last_7_days' },
        ],
        conditionLogic: 'or',
        actions: [{ type: 'pause', params: {} }],
      })

      const result = service.evaluateRule(rule, {
        campaignId: 'camp-1',
        campaignName: 'Test Campaign',
        metrics: { spend: 50, cpa: 60, conversions: 5, clicks: 100, impressions: 5000, ctr: 2, roas: 1.5 },
      })

      expect(result.matched).toBe(true)
    })

    it('should evaluate between operator correctly', () => {
      const rule = service.createRule({
        name: 'Test Rule',
        description: 'Test',
        sourceAccountId: 'account-1',
        conditions: [
          { metric: 'cpa', operator: 'between', value: 20, value2: 50, timeframe: 'last_7_days' },
        ],
        actions: [{ type: 'notify', params: { notificationMessage: 'CPA in range' } }],
      })

      // CPA = 30 (within range)
      const result1 = service.evaluateRule(rule, {
        campaignId: 'camp-1',
        campaignName: 'Test Campaign',
        metrics: { spend: 100, cpa: 30, conversions: 5, clicks: 100, impressions: 5000, ctr: 2, roas: 1.5 },
      })
      expect(result1.matched).toBe(true)

      // CPA = 60 (outside range)
      const result2 = service.evaluateRule(rule, {
        campaignId: 'camp-1',
        campaignName: 'Test Campaign',
        metrics: { spend: 100, cpa: 60, conversions: 5, clicks: 100, impressions: 5000, ctr: 2, roas: 1.5 },
      })
      expect(result2.matched).toBe(false)
    })
  })

  describe('recordTrigger', () => {
    it('should update rule stats on trigger', () => {
      const rule = service.createRule({
        name: 'Test Rule',
        description: 'Test',
        sourceAccountId: 'account-1',
        conditions: [{ metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' }],
        actions: [{ type: 'pause', params: {} }],
      })

      expect(rule.stats.timesTriggered).toBe(0)

      service.recordTrigger(rule.id, 'camp-1')

      const updated = service.getRule(rule.id)
      expect(updated?.stats.timesTriggered).toBe(1)
      expect(updated?.stats.lastTriggeredAt).toBeDefined()
    })
  })

  describe('activateRule and pauseRule', () => {
    it('should change rule status', () => {
      const rule = service.createRule({
        name: 'Test Rule',
        description: 'Test',
        sourceAccountId: 'account-1',
        conditions: [{ metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' }],
        actions: [{ type: 'pause', params: {} }],
      })

      expect(rule.status).toBe('draft')

      const activated = service.activateRule(rule.id)
      expect(activated.status).toBe('active')

      const paused = service.pauseRule(rule.id)
      expect(paused.status).toBe('paused')
    })
  })

  describe('listRules', () => {
    it('should list rules for source account', () => {
      service.createRule({
        name: 'Rule 1',
        description: 'Test',
        sourceAccountId: 'account-1',
        conditions: [{ metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' }],
        actions: [{ type: 'pause', params: {} }],
      })

      service.createRule({
        name: 'Rule 2',
        description: 'Test',
        sourceAccountId: 'account-1',
        conditions: [{ metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' }],
        actions: [{ type: 'pause', params: {} }],
      })

      service.createRule({
        name: 'Rule 3',
        description: 'Test',
        sourceAccountId: 'account-2', // Different account
        conditions: [{ metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' }],
        actions: [{ type: 'pause', params: {} }],
      })

      const rules = service.listRules('account-1')
      expect(rules).toHaveLength(2)
    })

    it('should filter by status', () => {
      const rule1 = service.createRule({
        name: 'Rule 1',
        description: 'Test',
        sourceAccountId: 'account-1',
        conditions: [{ metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' }],
        actions: [{ type: 'pause', params: {} }],
      })

      service.createRule({
        name: 'Rule 2',
        description: 'Test',
        sourceAccountId: 'account-1',
        conditions: [{ metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' }],
        actions: [{ type: 'pause', params: {} }],
      })

      service.activateRule(rule1.id)

      const activeRules = service.listRules('account-1', 'active')
      expect(activeRules).toHaveLength(1)
      expect(activeRules[0].name).toBe('Rule 1')
    })
  })

  describe('deleteRule', () => {
    it('should delete draft rule', () => {
      const rule = service.createRule({
        name: 'Test Rule',
        description: 'Test',
        sourceAccountId: 'account-1',
        conditions: [{ metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' }],
        actions: [{ type: 'pause', params: {} }],
      })

      const result = service.deleteRule(rule.id)
      expect(result).toBe(true)
      expect(service.getRule(rule.id)).toBeNull()
    })

    it('should throw for active rule', () => {
      const rule = service.createRule({
        name: 'Test Rule',
        description: 'Test',
        sourceAccountId: 'account-1',
        conditions: [{ metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' }],
        actions: [{ type: 'pause', params: {} }],
      })

      service.activateRule(rule.id)

      expect(() => service.deleteRule(rule.id)).toThrow('Cannot delete active rule')
    })
  })

  describe('cloneRule', () => {
    it('should clone rule with new name', () => {
      const original = service.createRule({
        name: 'Original Rule',
        description: 'Test',
        sourceAccountId: 'account-1',
        conditions: [{ metric: 'cpa', operator: 'gt', value: 50, timeframe: 'last_7_days' }],
        actions: [{ type: 'pause', params: {} }],
      })

      const clone = service.cloneRule(original.id, 'Cloned Rule')

      expect(clone.id).not.toBe(original.id)
      expect(clone.name).toBe('Cloned Rule')
      expect(clone.description).toContain('Clone of')
      expect(clone.conditions[0].metric).toBe(original.conditions[0].metric)
      expect(clone.actions[0].type).toBe(original.actions[0].type)
    })
  })

  describe('getTemplates', () => {
    it('should return rule templates', () => {
      const templates = service.getTemplates()

      expect(templates.length).toBeGreaterThan(0)
      expect(templates[0]).toHaveProperty('id')
      expect(templates[0]).toHaveProperty('name')
      expect(templates[0]).toHaveProperty('conditions')
      expect(templates[0]).toHaveProperty('actions')
    })
  })
})
