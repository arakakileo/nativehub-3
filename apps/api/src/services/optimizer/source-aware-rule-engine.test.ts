/**
 * Source-Aware Rule Engine Tests
 *
 * Tests for source-specific rule evaluation including:
 * - Template application per source
 * - Block limit enforcement
 * - Reporting delay handling
 * - Dynamic CPA threshold resolution
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SourceAwareRuleEngine, type RuleEngineContext } from './source-aware-rule-engine.js'
import type { PlacementMetrics, SourceConstraints } from './adapters/interface.js'
import type { OptimizerRule } from '../../db/schema.js'

// Test data factory
function createPlacement(overrides: Partial<PlacementMetrics> = {}): PlacementMetrics {
  return {
    id: 'placement-001',
    name: 'Test Placement',
    spend: 100,
    impressions: 10000,
    clicks: 500,
    conversions: 5,
    cpc: 0.2,
    cpa: 20,
    ctr: 5,
    ...overrides,
  }
}

function createOutbrainConstraints(): SourceConstraints {
  return {
    maxBlocksPerCampaign: 30,
    minBlockThreshold: 400,
    reportingDelayHours: 4,
    rateLimit: { requestsPerSecond: 30 },
    supportsDirectBidAdjust: true,
    placementTerminology: 'publisher',
  }
}

function createTaboolaConstraints(): SourceConstraints {
  return {
    maxBlocksPerCampaign: 1500,
    minBlockThreshold: 50,
    reportingDelayHours: 0,
    rateLimit: { requestsPerMinute: 60 },
    supportsDirectBidAdjust: true,
    placementTerminology: 'site',
  }
}

function createMgidConstraints(): SourceConstraints {
  return {
    maxBlocksPerCampaign: null,
    minBlockThreshold: 20,
    reportingDelayHours: 1,
    rateLimit: { requestsPerMinute: 100 },
    supportsDirectBidAdjust: false, // MGID doesn't support widget-level bids
    placementTerminology: 'widget',
  }
}

function createRule(overrides: Partial<OptimizerRule> = {}): OptimizerRule {
  return {
    id: 'rule-001',
    optimizerCampaignId: 'campaign-001',
    name: 'Test Rule',
    enabled: true,
    priority: 1,
    ruleType: 'custom',
    templateId: null,
    condition: {
      and: [
        { metric: 'spend', operator: 'gte', value: 50 },
        { metric: 'conversions', operator: 'eq', value: 0 },
      ],
    },
    action: { type: 'blacklist' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as OptimizerRule
}

describe('SourceAwareRuleEngine', () => {
  let engine: SourceAwareRuleEngine

  beforeEach(() => {
    engine = new SourceAwareRuleEngine()
  })

  describe('Basic Rule Evaluation', () => {
    it('should generate blacklist action when condition matches', () => {
      const context: RuleEngineContext = {
        sourceId: 'outbrain',
        targetCpa: 50,
        constraints: createOutbrainConstraints(),
      }

      const placements = [
        createPlacement({ id: 'p1', spend: 100, conversions: 0, cpa: 0 }),
      ]

      const rules = [createRule()]

      const actions = engine.generateActions(rules, placements, context)

      expect(actions).toHaveLength(1)
      expect(actions[0].actionType).toBe('blacklist')
      expect(actions[0].placementId).toBe('p1')
      expect(actions[0].skipped).toBeFalsy()
    })

    it('should not generate action when condition does not match', () => {
      const context: RuleEngineContext = {
        sourceId: 'outbrain',
        targetCpa: 50,
        constraints: createOutbrainConstraints(),
      }

      const placements = [
        createPlacement({ id: 'p1', spend: 30, conversions: 0 }), // Below spend threshold
      ]

      const rules = [createRule()]

      const actions = engine.generateActions(rules, placements, context)

      expect(actions).toHaveLength(0)
    })

    it('should skip disabled rules', () => {
      const context: RuleEngineContext = {
        sourceId: 'outbrain',
        targetCpa: 50,
        constraints: createOutbrainConstraints(),
      }

      const placements = [createPlacement({ spend: 100, conversions: 0 })]
      const rules = [createRule({ enabled: false })]

      const actions = engine.generateActions(rules, placements, context)

      expect(actions).toHaveLength(0)
    })
  })

  describe('Block Limit Enforcement', () => {
    it('should enforce Outbrain 30 block limit', () => {
      const context: RuleEngineContext = {
        sourceId: 'outbrain',
        targetCpa: 50,
        constraints: createOutbrainConstraints(),
        currentBlockedCount: 29, // Already at 29
      }

      // Create 5 placements that all match the rule
      const placements = Array.from({ length: 5 }, (_, i) =>
        createPlacement({ id: `p${i}`, name: `Placement ${i}`, spend: 100, conversions: 0, cpa: 0 })
      )

      const rules = [createRule()]

      const actions = engine.generateActions(rules, placements, context)

      // Only 1 should be actionable (29 + 1 = 30), rest skipped
      const actionable = actions.filter((a) => !a.skipped)
      const skipped = actions.filter((a) => a.skipped)

      expect(actionable).toHaveLength(1)
      expect(skipped).toHaveLength(4)
      expect(skipped[0].skipReason).toContain('Block limit reached')
    })

    it('should not enforce limit for Taboola (1500 limit)', () => {
      const context: RuleEngineContext = {
        sourceId: 'taboola',
        targetCpa: 50,
        constraints: createTaboolaConstraints(),
        currentBlockedCount: 100,
      }

      const placements = Array.from({ length: 10 }, (_, i) =>
        createPlacement({ id: `p${i}`, name: `Placement ${i}`, spend: 100, conversions: 0, cpa: 0 })
      )

      const rules = [createRule()]

      const actions = engine.generateActions(rules, placements, context)

      // All should be actionable (100 + 10 = 110, well under 1500)
      const actionable = actions.filter((a) => !a.skipped)
      expect(actionable).toHaveLength(10)
    })

    it('should allow unlimited blocks for MGID (null limit)', () => {
      const context: RuleEngineContext = {
        sourceId: 'mgid',
        targetCpa: 50,
        constraints: createMgidConstraints(),
        currentBlockedCount: 1000,
      }

      const placements = Array.from({ length: 5 }, (_, i) =>
        createPlacement({ id: `p${i}`, name: `Placement ${i}`, spend: 100, conversions: 0, cpa: 0 })
      )

      const rules = [createRule()]

      const actions = engine.generateActions(rules, placements, context)

      // All should be actionable (no limit)
      const actionable = actions.filter((a) => !a.skipped)
      expect(actionable).toHaveLength(5)
    })
  })

  describe('Bid Adjustment Support', () => {
    it('should allow bid adjustments for Outbrain', () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000) // Past reporting delay

      const context: RuleEngineContext = {
        sourceId: 'outbrain',
        targetCpa: 50,
        constraints: createOutbrainConstraints(),
        lastDataUpdate: fiveHoursAgo, // Data is settled
      }

      const placements = [
        createPlacement({
          id: 'p1',
          spend: 50,
          conversions: 3,
          cpa: 16.67, // Below 0.8 * 50 = 40
          metadata: { currentBid: 0.5 },
        }),
      ]

      const rules = [
        createRule({
          condition: {
            and: [
              { metric: 'conversions', operator: 'gte', value: 2 },
              { metric: 'cpa', operator: 'lt', value: 40 },
            ],
          },
          action: { type: 'bid_increase', value: 10 },
        }),
      ]

      const actions = engine.generateActions(rules, placements, context)

      expect(actions).toHaveLength(1)
      expect(actions[0].actionType).toBe('bid_increase')
      expect(actions[0].previousValue).toBe(0.5)
      expect(actions[0].newValue).toBe(0.55) // 10% increase
      expect(actions[0].skipped).toBeFalsy()
    })

    it('should skip bid adjustments for MGID (not supported)', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000) // Past MGID's 1h delay

      const context: RuleEngineContext = {
        sourceId: 'mgid',
        targetCpa: 50,
        constraints: createMgidConstraints(),
        lastDataUpdate: twoHoursAgo,
      }

      const placements = [
        createPlacement({
          id: 'p1',
          spend: 50,
          conversions: 3,
          cpa: 16.67,
        }),
      ]

      const rules = [
        createRule({
          condition: {
            and: [
              { metric: 'conversions', operator: 'gte', value: 2 },
              { metric: 'cpa', operator: 'lt', value: 40 },
            ],
          },
          action: { type: 'bid_increase', value: 10 },
        }),
      ]

      const actions = engine.generateActions(rules, placements, context)

      expect(actions).toHaveLength(1)
      expect(actions[0].skipped).toBe(true)
      expect(actions[0].skipReason).toContain('does not support placement-level bid adjustments')
    })
  })

  describe('Reporting Delay Handling', () => {
    it('should always act on Taboola (0h delay)', () => {
      const context: RuleEngineContext = {
        sourceId: 'taboola',
        targetCpa: 50,
        constraints: createTaboolaConstraints(),
        lastDataUpdate: new Date(), // Just now
      }

      const placements = [createPlacement({ spend: 60, conversions: 0, cpa: 0 })]
      const rules = [createRule()]

      const actions = engine.generateActions(rules, placements, context)

      expect(actions).toHaveLength(1)
      expect(actions[0].skipped).toBeFalsy()
    })

    it('should act on Outbrain if data is older than 4h', () => {
      const fourHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000) // 5 hours ago

      const context: RuleEngineContext = {
        sourceId: 'outbrain',
        targetCpa: 50,
        constraints: createOutbrainConstraints(),
        lastDataUpdate: fourHoursAgo,
      }

      const placements = [createPlacement({ spend: 60, conversions: 0, cpa: 0 })]
      const rules = [createRule()]

      const actions = engine.generateActions(rules, placements, context)

      expect(actions).toHaveLength(1)
      expect(actions[0].skipped).toBeFalsy()
    })

    it('should act on high-confidence cases even with fresh Outbrain data', () => {
      const justNow = new Date() // Just now - within 4h delay

      const context: RuleEngineContext = {
        sourceId: 'outbrain',
        targetCpa: 50,
        constraints: createOutbrainConstraints(),
        lastDataUpdate: justNow,
      }

      // High spend + 0 conversions = high confidence
      const placements = [createPlacement({ spend: 150, conversions: 0, cpa: 0 })]
      const rules = [createRule()]

      const actions = engine.generateActions(rules, placements, context)

      expect(actions).toHaveLength(1)
      expect(actions[0].skipped).toBeFalsy()
    })

    it('should skip low-confidence cases with fresh Outbrain data', () => {
      const justNow = new Date()

      const context: RuleEngineContext = {
        sourceId: 'outbrain',
        targetCpa: 50,
        constraints: createOutbrainConstraints(),
        lastDataUpdate: justNow,
      }

      // Low spend - not high confidence
      const placements = [createPlacement({ spend: 60, conversions: 0, cpa: 0 })]
      const rules = [createRule()]

      const actions = engine.generateActions(rules, placements, context)

      // Should be skipped due to fresh data + low confidence
      expect(actions).toHaveLength(0)
    })
  })

  describe('Template-Based Rules', () => {
    it('should apply source template with targetCpa threshold', () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000)

      const context: RuleEngineContext = {
        sourceId: 'outbrain',
        targetCpa: 30, // Target CPA of $30
        constraints: createOutbrainConstraints(),
        lastDataUpdate: fiveHoursAgo, // Data is settled
      }

      const placements = [
        createPlacement({
          id: 'p1',
          spend: 100,
          conversions: 1,
          cpa: 100, // CPA $100 > 2x target ($60)
        }),
      ]

      const rules = [
        createRule({
          ruleType: 'template',
          templateId: 'outbrain_block_high_cpa',
          condition: null, // Will be loaded from template
        }),
      ]

      const actions = engine.generateActions(rules, placements, context)

      expect(actions).toHaveLength(1)
      expect(actions[0].actionType).toBe('blacklist')
      expect(actions[0].reason).toContain('exceeds target')
    })

    it('should not trigger if CPA is below threshold', () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000)

      const context: RuleEngineContext = {
        sourceId: 'outbrain',
        targetCpa: 30,
        constraints: createOutbrainConstraints(),
        lastDataUpdate: fiveHoursAgo,
      }

      const placements = [
        createPlacement({
          id: 'p1',
          spend: 100,
          conversions: 2,
          cpa: 50, // CPA $50 < 2x target ($60)
        }),
      ]

      const rules = [
        createRule({
          ruleType: 'template',
          templateId: 'outbrain_block_high_cpa',
          condition: null,
        }),
      ]

      const actions = engine.generateActions(rules, placements, context)

      expect(actions).toHaveLength(0)
    })
  })

  describe('Rule Priority', () => {
    it('should process rules in priority order', () => {
      const context: RuleEngineContext = {
        sourceId: 'taboola',
        targetCpa: 50,
        constraints: createTaboolaConstraints(),
      }

      const placements = [
        createPlacement({ id: 'p1', spend: 100, conversions: 0, cpa: 0 }),
      ]

      // Two rules that both match, different priorities
      const rules = [
        createRule({
          id: 'rule-low-priority',
          priority: 10,
          name: 'Low Priority',
          action: { type: 'pause' },
        }),
        createRule({
          id: 'rule-high-priority',
          priority: 1,
          name: 'High Priority',
          action: { type: 'blacklist' },
        }),
      ]

      const actions = engine.generateActions(rules, placements, context)

      // Only one action (higher priority wins)
      expect(actions).toHaveLength(1)
      expect(actions[0].ruleName).toBe('High Priority')
      expect(actions[0].actionType).toBe('blacklist')
    })
  })

  describe('Confidence Score', () => {
    it('should calculate higher confidence with more spend', () => {
      const context: RuleEngineContext = {
        sourceId: 'taboola',
        targetCpa: 50, // 3x = 150
        constraints: createTaboolaConstraints(),
      }

      const lowSpendPlacement = createPlacement({ id: 'p1', spend: 50, conversions: 0 })
      const highSpendPlacement = createPlacement({ id: 'p2', spend: 150, conversions: 0 })

      const rules = [createRule()]

      const actions1 = engine.generateActions(rules, [lowSpendPlacement], context)
      const actions2 = engine.generateActions(rules, [highSpendPlacement], context)

      expect(actions1[0].confidenceScore).toBeLessThan(actions2[0].confidenceScore)
    })

    it('should calculate higher confidence with more conversions', () => {
      const context: RuleEngineContext = {
        sourceId: 'taboola',
        targetCpa: 50,
        constraints: createTaboolaConstraints(),
      }

      // Rule that matches on high CPA (both placements should match)
      const rules = [
        createRule({
          condition: {
            and: [
              { metric: 'spend', operator: 'gte', value: 50 },
              { metric: 'conversions', operator: 'gte', value: 1 },
              { metric: 'cpa', operator: 'gt', value: 99 }, // Both have CPA >= 100
            ],
          },
        }),
      ]

      const fewConversions = createPlacement({ id: 'p1', spend: 150, conversions: 1, cpa: 150 })
      const manyConversions = createPlacement({ id: 'p2', spend: 500, conversions: 5, cpa: 100 })

      const actions1 = engine.generateActions(rules, [fewConversions], context)
      const actions2 = engine.generateActions(rules, [manyConversions], context)

      expect(actions1).toHaveLength(1)
      expect(actions2).toHaveLength(1)
      expect(actions1[0].confidenceScore).toBeLessThan(actions2[0].confidenceScore)
    })
  })

  describe('Compound Conditions', () => {
    it('should evaluate AND conditions correctly', () => {
      const context: RuleEngineContext = {
        sourceId: 'taboola',
        targetCpa: 50,
        constraints: createTaboolaConstraints(),
      }

      const placements = [
        createPlacement({ id: 'p1', spend: 100, conversions: 0 }), // Matches both
        createPlacement({ id: 'p2', spend: 30, conversions: 0 }), // Fails spend check
        createPlacement({ id: 'p3', spend: 100, conversions: 5 }), // Fails conversion check
      ]

      const rules = [
        createRule({
          condition: {
            and: [
              { metric: 'spend', operator: 'gte', value: 50 },
              { metric: 'conversions', operator: 'eq', value: 0 },
            ],
          },
        }),
      ]

      const actions = engine.generateActions(rules, placements, context)

      expect(actions).toHaveLength(1)
      expect(actions[0].placementId).toBe('p1')
    })

    it('should evaluate OR conditions correctly', () => {
      const context: RuleEngineContext = {
        sourceId: 'taboola',
        targetCpa: 50,
        constraints: createTaboolaConstraints(),
      }

      const placements = [
        createPlacement({ id: 'p1', spend: 100, conversions: 0 }), // Matches first condition
        createPlacement({ id: 'p2', spend: 30, conversions: 0, cpa: 0, ctr: 0.1 }), // Matches second (low CTR)
        createPlacement({ id: 'p3', spend: 30, conversions: 5, ctr: 5 }), // Matches neither
      ]

      const rules = [
        createRule({
          condition: {
            or: [
              { metric: 'spend', operator: 'gte', value: 50 },
              { metric: 'ctr', operator: 'lt', value: 1 },
            ],
          },
        }),
      ]

      const actions = engine.generateActions(rules, placements, context)

      expect(actions).toHaveLength(2)
      expect(actions.map((a) => a.placementId).sort()).toEqual(['p1', 'p2'])
    })
  })
})
