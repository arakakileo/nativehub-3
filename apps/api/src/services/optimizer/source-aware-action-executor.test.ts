/**
 * Source-Aware Action Executor Tests
 *
 * Tests for action execution with:
 * - Error categorization
 * - Retry logic
 * - Batch execution
 * - Rate limit handling
 * - Rollback support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  SourceAwareActionExecutor,
  categorizeError,
  isRetryableError,
  type ActionErrorType,
} from './source-aware-action-executor.js'
import type { OptimizerAdapter, SourceConstraints, BlockResult, BidResult } from './adapters/interface.js'
import type { SourceAwareAction } from './source-aware-rule-engine.js'

// Mock the database
vi.mock('../../lib/db.js', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'test-action-id' }])),
        onConflictDoNothing: vi.fn(() => Promise.resolve()),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
    query: {
      optimizerActions: {
        findFirst: vi.fn(() =>
          Promise.resolve({
            id: 'test-action-id',
            executed: true,
            actionType: 'blacklist',
            targetId: 'widget-123',
            previousValue: null,
          })
        ),
      },
    },
  },
}))

vi.mock('../../db/schema.js', () => ({
  optimizerActions: { id: 'id' },
  widgetBlacklist: { widgetId: 'widget_id' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
}))

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

/**
 * Create mock Outbrain constraints
 */
function createOutbrainConstraints(): SourceConstraints {
  return {
    maxBlocksPerCampaign: 30,
    minBlockThreshold: 100,
    reportingDelayHours: 4,
    rateLimit: { requestsPerSecond: 30 },
    supportsDirectBidAdjust: true,
    placementTerminology: 'publisher',
  }
}

/**
 * Create mock Taboola constraints
 */
function createTaboolaConstraints(): SourceConstraints {
  return {
    maxBlocksPerCampaign: 1500,
    minBlockThreshold: 50,
    reportingDelayHours: 0,
    rateLimit: { requestsPerMinute: 10 },
    supportsDirectBidAdjust: true,
    placementTerminology: 'site',
  }
}

/**
 * Create mock MGID constraints (no bid adjust)
 */
function createMgidConstraints(): SourceConstraints {
  return {
    maxBlocksPerCampaign: null,
    minBlockThreshold: 50,
    reportingDelayHours: 0,
    rateLimit: { requestsPerSecond: 10 },
    supportsDirectBidAdjust: false,
    placementTerminology: 'widget',
  }
}

/**
 * Create mock adapter
 */
function createMockAdapter(
  sourceId: string,
  constraints: SourceConstraints,
  overrides?: {
    blockPlacement?: (params: unknown) => Promise<BlockResult>
    adjustPlacementBid?: (params: unknown) => Promise<BidResult>
  }
): OptimizerAdapter {
  return {
    sourceId,
    getConstraints: () => constraints,
    getPlacementsWithMetrics: vi.fn(),
    blockPlacement: overrides?.blockPlacement ?? vi.fn(() => Promise.resolve({ success: true, placementId: 'test' })),
    adjustPlacementBid:
      overrides?.adjustPlacementBid ??
      vi.fn(() => Promise.resolve({ success: true, placementId: 'test', previousBid: 0.5, newBid: 0.6 })),
  }
}

/**
 * Create test action
 */
function createTestAction(overrides?: Partial<SourceAwareAction>): SourceAwareAction {
  return {
    ruleId: 'rule-123',
    ruleName: 'Test Rule',
    actionType: 'blacklist',
    targetType: 'placement',
    placementId: 'widget-123',
    placementName: 'Test Widget',
    reason: 'High spend, no conversions',
    metrics: {
      id: 'widget-123',
      name: 'Test Widget',
      spend: 100,
      impressions: 10000,
      clicks: 500,
      conversions: 0,
      cpc: 0.2,
      cpa: 0,
      ctr: 5,
    },
    confidenceScore: 0.85,
    ...overrides,
  }
}

describe('Error Categorization', () => {
  describe('categorizeError', () => {
    it('should categorize rate limit errors', () => {
      expect(categorizeError('Rate limit exceeded')).toBe('rate_limit')
      expect(categorizeError('HTTP 429 Too Many Requests')).toBe('rate_limit')
      expect(categorizeError(new Error('too many requests'))).toBe('rate_limit')
    })

    it('should categorize block limit errors', () => {
      expect(categorizeError('Maximum publishers blocked')).toBe('block_limit')
      expect(categorizeError('Block limit exceeded for campaign')).toBe('block_limit')
    })

    it('should categorize not found errors', () => {
      expect(categorizeError('Publisher not found')).toBe('not_found')
      expect(categorizeError('HTTP 404 - Resource does not exist')).toBe('not_found')
    })

    it('should categorize permission errors', () => {
      expect(categorizeError('Unauthorized access')).toBe('permission')
      expect(categorizeError('HTTP 403 Forbidden')).toBe('permission')
      expect(categorizeError('401 - Invalid credentials')).toBe('permission')
      expect(categorizeError('Permission denied')).toBe('permission')
    })

    it('should categorize validation errors', () => {
      expect(categorizeError('Validation failed')).toBe('validation')
      expect(categorizeError('Invalid bid value')).toBe('validation')
      expect(categorizeError('Bad request - missing parameters')).toBe('validation')
    })

    it('should categorize network errors', () => {
      expect(categorizeError('Network error')).toBe('network')
      expect(categorizeError('ECONNREFUSED')).toBe('network')
      expect(categorizeError('Request timeout')).toBe('network')
      expect(categorizeError('ENOTFOUND - DNS lookup failed')).toBe('network')
    })

    it('should categorize unsupported errors', () => {
      expect(categorizeError('Operation not supported')).toBe('unsupported')
      expect(categorizeError('Unsupported action type')).toBe('unsupported')
    })

    it('should default to unknown for unrecognized errors', () => {
      expect(categorizeError('Something went wrong')).toBe('unknown')
      expect(categorizeError(new Error('Random error'))).toBe('unknown')
    })
  })

  describe('isRetryableError', () => {
    it('should mark rate_limit as retryable', () => {
      expect(isRetryableError('rate_limit')).toBe(true)
    })

    it('should mark network as retryable', () => {
      expect(isRetryableError('network')).toBe(true)
    })

    it('should mark unknown as retryable', () => {
      expect(isRetryableError('unknown')).toBe(true)
    })

    it('should mark block_limit as non-retryable', () => {
      expect(isRetryableError('block_limit')).toBe(false)
    })

    it('should mark not_found as non-retryable', () => {
      expect(isRetryableError('not_found')).toBe(false)
    })

    it('should mark permission as non-retryable', () => {
      expect(isRetryableError('permission')).toBe(false)
    })

    it('should mark validation as non-retryable', () => {
      expect(isRetryableError('validation')).toBe(false)
    })

    it('should mark unsupported as non-retryable', () => {
      expect(isRetryableError('unsupported')).toBe(false)
    })
  })
})

describe('SourceAwareActionExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('execute', () => {
    it('should execute blacklist action successfully', async () => {
      const adapter = createMockAdapter('outbrain', createOutbrainConstraints())
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const action = createTestAction()
      const result = await executor.execute(action)

      expect(result.success).toBe(true)
      expect(result.placementId).toBe('widget-123')
      expect(result.actionType).toBe('blacklist')
      expect(adapter.blockPlacement).toHaveBeenCalledWith({
        campaignId: 'ext-camp-1',
        placementId: 'widget-123',
        reason: 'High spend, no conversions',
      })
    })

    it('should execute bid_increase action successfully', async () => {
      const adapter = createMockAdapter('outbrain', createOutbrainConstraints())
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const action = createTestAction({
        actionType: 'bid_increase',
        previousValue: 0.5,
        newValue: 0.6,
      })
      const result = await executor.execute(action)

      expect(result.success).toBe(true)
      expect(result.actionType).toBe('bid_increase')
      expect(adapter.adjustPlacementBid).toHaveBeenCalledWith({
        campaignId: 'ext-camp-1',
        placementId: 'widget-123',
        newBid: 0.6,
        previousBid: 0.5,
      })
    })

    it('should skip bid actions for sources without bid support', async () => {
      const adapter = createMockAdapter('mgid', createMgidConstraints())
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const action = createTestAction({
        actionType: 'bid_increase',
        previousValue: 0.5,
        newValue: 0.6,
      })
      const result = await executor.execute(action)

      expect(result.success).toBe(false)
      expect(result.error).toContain('does not support placement-level bid adjustments')
      expect(adapter.adjustPlacementBid).not.toHaveBeenCalled()
    })

    it('should skip already-skipped actions', async () => {
      const adapter = createMockAdapter('outbrain', createOutbrainConstraints())
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const action = createTestAction({
        skipped: true,
        skipReason: 'Block limit reached',
      })
      const result = await executor.execute(action)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Block limit reached')
      expect(adapter.blockPlacement).not.toHaveBeenCalled()
    })

    it('should handle execution failure', async () => {
      const adapter = createMockAdapter('outbrain', createOutbrainConstraints(), {
        blockPlacement: vi.fn(() => Promise.resolve({ success: false, placementId: 'test', error: 'API Error' })),
      })
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const action = createTestAction()
      const result = await executor.execute(action)

      expect(result.success).toBe(false)
      expect(result.error).toContain('API Error')
    })

    it('should categorize errors correctly', async () => {
      const adapter = createMockAdapter('outbrain', createOutbrainConstraints(), {
        blockPlacement: vi.fn(() => Promise.reject(new Error('Rate limit exceeded'))),
      })
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const action = createTestAction()
      const result = await executor.execute(action)

      expect(result.success).toBe(false)
      expect(result.errorType).toBe('rate_limit')
      expect(result.retryable).toBe(true)
    })
  })

  describe('executeWithRetry', () => {
    it('should retry on rate limit errors', async () => {
      let callCount = 0
      const adapter = createMockAdapter('outbrain', createOutbrainConstraints(), {
        blockPlacement: vi.fn(() => {
          callCount++
          if (callCount < 3) {
            return Promise.reject(new Error('Rate limit exceeded'))
          }
          return Promise.resolve({ success: true, placementId: 'test' })
        }),
      })
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const action = createTestAction()
      const result = await executor.executeWithRetry(action, 3)

      expect(result.success).toBe(true)
      expect(callCount).toBe(3)
    })

    it('should not retry on non-retryable errors', async () => {
      let callCount = 0
      const adapter = createMockAdapter('outbrain', createOutbrainConstraints(), {
        blockPlacement: vi.fn(() => {
          callCount++
          return Promise.reject(new Error('Permission denied'))
        }),
      })
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const action = createTestAction()
      const result = await executor.executeWithRetry(action, 3)

      expect(result.success).toBe(false)
      expect(result.errorType).toBe('permission')
      expect(callCount).toBe(1)
    })

    it('should give up after max retries', async () => {
      let callCount = 0
      const adapter = createMockAdapter('outbrain', createOutbrainConstraints(), {
        blockPlacement: vi.fn(() => {
          callCount++
          return Promise.reject(new Error('Network error'))
        }),
      })
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const action = createTestAction()
      const result = await executor.executeWithRetry(action, 2)

      expect(result.success).toBe(false)
      expect(callCount).toBe(2)
    })
  })

  describe('executeBatch', () => {
    it('should execute all actions in batch', async () => {
      const adapter = createMockAdapter('outbrain', createOutbrainConstraints())
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const actions = [
        createTestAction({ placementId: 'widget-1' }),
        createTestAction({ placementId: 'widget-2' }),
        createTestAction({ placementId: 'widget-3' }),
      ]

      const result = await executor.executeBatch(actions)

      expect(result.summary.total).toBe(3)
      expect(result.summary.success).toBe(3)
      expect(result.summary.failed).toBe(0)
      expect(result.rolledBack).toBe(false)
    })

    it('should handle dry run mode', async () => {
      const adapter = createMockAdapter('outbrain', createOutbrainConstraints())
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const actions = [createTestAction({ placementId: 'widget-1' }), createTestAction({ placementId: 'widget-2' })]

      const result = await executor.executeBatch(actions, { dryRun: true })

      expect(result.summary.success).toBe(2)
      expect(adapter.blockPlacement).not.toHaveBeenCalled()
      expect(result.results[0].actionId).toContain('dry-run')
    })

    it('should count skipped actions', async () => {
      const adapter = createMockAdapter('outbrain', createOutbrainConstraints())
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const actions = [
        createTestAction({ placementId: 'widget-1' }),
        createTestAction({ placementId: 'widget-2', skipped: true, skipReason: 'Block limit' }),
        createTestAction({ placementId: 'widget-3' }),
      ]

      const result = await executor.executeBatch(actions)

      expect(result.summary.total).toBe(3)
      expect(result.summary.success).toBe(2)
      expect(result.summary.skipped).toBe(1)
    })

    it('should stop on first failure when configured', async () => {
      const blockPlacementMock = vi.fn()
      blockPlacementMock
        .mockResolvedValueOnce({ success: true, placementId: 'widget-1' })
        .mockResolvedValueOnce({ success: false, placementId: 'widget-2', error: 'Failed' })
        .mockResolvedValueOnce({ success: true, placementId: 'widget-3' })

      const adapter = createMockAdapter('outbrain', createOutbrainConstraints(), {
        blockPlacement: blockPlacementMock,
      })
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const actions = [
        createTestAction({ placementId: 'widget-1' }),
        createTestAction({ placementId: 'widget-2' }),
        createTestAction({ placementId: 'widget-3' }),
      ]

      // Set maxRetries: 1 to avoid retrying the failed action
      const result = await executor.executeBatch(actions, { stopOnFirstFailure: true, maxRetries: 1 })

      expect(result.summary.success).toBe(1)
      expect(result.summary.failed).toBe(1)
      expect(result.rolledBack).toBe(true)
      // Should not execute third action
      expect(blockPlacementMock).toHaveBeenCalledTimes(2)
    })

    it('should continue on failure when not configured to stop', async () => {
      const blockPlacementMock = vi.fn()
      blockPlacementMock
        .mockResolvedValueOnce({ success: true, placementId: 'widget-1' })
        .mockResolvedValueOnce({ success: false, placementId: 'widget-2', error: 'Failed' })
        .mockResolvedValueOnce({ success: true, placementId: 'widget-3' })

      const adapter = createMockAdapter('outbrain', createOutbrainConstraints(), {
        blockPlacement: blockPlacementMock,
      })
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const actions = [
        createTestAction({ placementId: 'widget-1' }),
        createTestAction({ placementId: 'widget-2' }),
        createTestAction({ placementId: 'widget-3' }),
      ]

      // Set maxRetries: 1 to avoid retrying the failed action
      const result = await executor.executeBatch(actions, { stopOnFirstFailure: false, maxRetries: 1 })

      expect(result.summary.success).toBe(2)
      expect(result.summary.failed).toBe(1)
      expect(result.rolledBack).toBe(false)
      expect(blockPlacementMock).toHaveBeenCalledTimes(3)
    })
  })

  describe('rollback', () => {
    it('should rollback blacklist action', async () => {
      const adapter = createMockAdapter('outbrain', createOutbrainConstraints())
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const result = await executor.rollback('test-action-id')

      expect(result).toBe(true)
    })

    it('should rollback bid action by restoring previous value', async () => {
      // Override the mock to return a bid action
      const { db } = await import('../../lib/db.js')
      vi.mocked(db.query.optimizerActions.findFirst).mockResolvedValueOnce({
        id: 'test-action-id',
        executed: true,
        actionType: 'bid_increase',
        targetId: 'widget-123',
        previousValue: '0.5',
      } as never)

      const adapter = createMockAdapter('outbrain', createOutbrainConstraints())
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const result = await executor.rollback('test-action-id')

      expect(result).toBe(true)
      expect(adapter.adjustPlacementBid).toHaveBeenCalledWith({
        campaignId: 'ext-camp-1',
        placementId: 'widget-123',
        newBid: 0.5,
      })
    })

    it('should return false for non-executed action', async () => {
      const { db } = await import('../../lib/db.js')
      vi.mocked(db.query.optimizerActions.findFirst).mockResolvedValueOnce({
        id: 'test-action-id',
        executed: false,
        actionType: 'blacklist',
        targetId: 'widget-123',
      } as never)

      const adapter = createMockAdapter('outbrain', createOutbrainConstraints())
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const result = await executor.rollback('test-action-id')

      expect(result).toBe(false)
    })

    it('should return false for non-existent action', async () => {
      const { db } = await import('../../lib/db.js')
      vi.mocked(db.query.optimizerActions.findFirst).mockResolvedValueOnce(null)

      const adapter = createMockAdapter('outbrain', createOutbrainConstraints())
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const result = await executor.rollback('nonexistent')

      expect(result).toBe(false)
    })
  })

  describe('Rate Limiting', () => {
    it('should apply rate limit delay for Outbrain (per-second)', async () => {
      // Use Outbrain which has 30 req/s = ~33ms between requests (faster test)
      const adapter = createMockAdapter('outbrain', createOutbrainConstraints())
      const executor = new SourceAwareActionExecutor(adapter, 'opt-camp-1', 'ext-camp-1', 'source-acc-1')

      const actions = [createTestAction({ placementId: 'pub-1' }), createTestAction({ placementId: 'pub-2' })]

      const startTime = Date.now()
      await executor.executeBatch(actions)
      const elapsed = Date.now() - startTime

      // With 30 req/s, should have ~33ms delay between actions
      // Allow some margin for test execution overhead
      expect(adapter.blockPlacement).toHaveBeenCalledTimes(2)
      // At minimum we expect some delay (> 30ms)
      expect(elapsed).toBeGreaterThan(20)
    })
  })
})
