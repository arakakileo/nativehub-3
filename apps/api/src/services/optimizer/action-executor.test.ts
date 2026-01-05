import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ActionExecutor } from './action-executor.js'
import { db } from '../../lib/db.js'
import { sourceAccounts, optimizerCampaigns, optimizerActions } from '../../db/schema.js'
import { encryptCredentials } from '../../lib/crypto.js'
import { TEST_USER_ID } from '../../test/fixtures/index.js'
import { eq } from 'drizzle-orm'
import type { GeneratedAction } from './rule-engine.js'

// Mock getAuthenticatedSource
vi.mock('../../traffic-sources/index.js', () => ({
  getAuthenticatedSource: vi.fn(),
}))

import { getAuthenticatedSource } from '../../traffic-sources/index.js'

describe('ActionExecutor', () => {
  let executor: ActionExecutor
  let testSourceAccountId: string
  let testOptimizerCampaignId: string

  beforeEach(async () => {
    vi.clearAllMocks()
    executor = new ActionExecutor()

    // Create test source account
    const { encrypted, iv } = encryptCredentials({ clientId: 'test', clientSecret: 'secret' })
    // Convert Buffer to hex string for PGlite compatibility
    const encryptedHex = encrypted.toString('hex')
    const ivHex = iv.toString('hex')
    const [account] = await db.insert(sourceAccounts).values({
      userId: TEST_USER_ID,
      sourceId: 'revcontent',
      name: 'Test Account',
      credentialsEncrypted: encryptedHex,
      credentialsIv: ivHex,
      status: 'connected',
    }).returning()
    testSourceAccountId = account.id

    // Create test optimizer campaign
    const [campaign] = await db.insert(optimizerCampaigns).values({
      sourceAccountId: testSourceAccountId,
      externalCampaignId: 'ext-123',
      enabled: true,
      targetCpa: '5.00',
      bidStrategy: 'target_cpa',
      bidStrategyConfig: {},
    }).returning()
    testOptimizerCampaignId = campaign.id
  })

  describe('executeActions', () => {
    it('should execute blacklist actions successfully', async () => {
      const mockSource = {
        blacklistWidget: vi.fn().mockResolvedValue({ success: true, widgetId: 'w1' }),
      }
      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      const actions: GeneratedAction[] = [{
        ruleId: null,
        ruleName: 'Blacklist No Conv',
        actionType: 'blacklist',
        targetType: 'widget',
        targetId: 'w1',
        targetName: 'Bad Widget',
        reason: 'High spend, no conversions',
        metrics: { spend: 100, conversions: 0 },
        confidenceScore: 0.9,
      }]

      const results = await executor.executeActions(
        actions,
        testOptimizerCampaignId,
        testSourceAccountId,
        'ext-123'
      )

      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      expect(mockSource.blacklistWidget).toHaveBeenCalledWith('ext-123', 'w1')
    })

    it('should execute bid increase actions', async () => {
      const mockSource = {
        adjustWidgetBid: vi.fn().mockResolvedValue({
          success: true,
          widgetId: 'w1',
          previousBid: 0.5,
          newBid: 0.55,
        }),
      }
      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      const actions: GeneratedAction[] = [{
        ruleId: null,
        ruleName: 'Raise Bid Good CPA',
        actionType: 'bid_increase',
        targetType: 'widget',
        targetId: 'w1',
        targetName: 'Good Widget',
        previousValue: 0.5,
        newValue: 0.55,
        reason: 'Good CPA',
        metrics: { spend: 50, conversions: 10 },
        confidenceScore: 0.85,
      }]

      const results = await executor.executeActions(
        actions,
        testOptimizerCampaignId,
        testSourceAccountId,
        'ext-123'
      )

      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      expect(mockSource.adjustWidgetBid).toHaveBeenCalledWith('ext-123', 'w1', 0.55)
    })

    it('should execute bid decrease actions', async () => {
      const mockSource = {
        adjustWidgetBid: vi.fn().mockResolvedValue({
          success: true,
          widgetId: 'w1',
          previousBid: 0.5,
          newBid: 0.4,
        }),
      }
      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      const actions: GeneratedAction[] = [{
        ruleId: null,
        ruleName: 'Lower Bid Bad CPA',
        actionType: 'bid_decrease',
        targetType: 'widget',
        targetId: 'w1',
        targetName: 'Mediocre Widget',
        previousValue: 0.5,
        newValue: 0.4,
        reason: 'High CPA',
        metrics: { spend: 50, conversions: 2 },
        confidenceScore: 0.75,
      }]

      const results = await executor.executeActions(
        actions,
        testOptimizerCampaignId,
        testSourceAccountId,
        'ext-123'
      )

      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
    })

    it('should execute pause actions via blacklist', async () => {
      const mockSource = {
        blacklistWidget: vi.fn().mockResolvedValue({ success: true, widgetId: 'w1' }),
      }
      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      const actions: GeneratedAction[] = [{
        ruleId: null,
        ruleName: 'Pause High Spend',
        actionType: 'pause',
        targetType: 'widget',
        targetId: 'w1',
        targetName: 'Bleeding Widget',
        reason: 'Excessive spend',
        metrics: { spend: 500, conversions: 0 },
        confidenceScore: 0.95,
      }]

      const results = await executor.executeActions(
        actions,
        testOptimizerCampaignId,
        testSourceAccountId,
        'ext-123'
      )

      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      expect(mockSource.blacklistWidget).toHaveBeenCalled()
    })

    it('should save action to database before execution', async () => {
      const mockSource = {
        blacklistWidget: vi.fn().mockResolvedValue({ success: true, widgetId: 'w1' }),
      }
      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      const actions: GeneratedAction[] = [{
        ruleId: null,
        ruleName: 'Blacklist Test',
        actionType: 'blacklist',
        targetType: 'widget',
        targetId: 'w1',
        targetName: 'Bad Widget',
        reason: 'Test reason',
        metrics: { spend: 100 },
        confidenceScore: 0.9,
      }]

      await executor.executeActions(
        actions,
        testOptimizerCampaignId,
        testSourceAccountId,
        'ext-123'
      )

      // Check action was saved
      const savedActions = await db.select()
        .from(optimizerActions)
        .where(eq(optimizerActions.optimizerCampaignId, testOptimizerCampaignId))

      expect(savedActions).toHaveLength(1)
      expect(savedActions[0].actionType).toBe('blacklist')
      expect(savedActions[0].targetId).toBe('w1')
      expect(savedActions[0].executed).toBe(true)
    })

    it('should mark action as executed on success', async () => {
      const mockSource = {
        blacklistWidget: vi.fn().mockResolvedValue({ success: true, widgetId: 'w1' }),
      }
      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      const actions: GeneratedAction[] = [{
        ruleId: null,
        ruleName: 'Mark Executed Test',
        actionType: 'blacklist',
        targetType: 'widget',
        targetId: 'w1',
        targetName: 'Bad Widget',
        reason: 'Test',
        metrics: {},
        confidenceScore: 0.9,
      }]

      await executor.executeActions(
        actions,
        testOptimizerCampaignId,
        testSourceAccountId,
        'ext-123'
      )

      const savedActions = await db.select()
        .from(optimizerActions)
        .where(eq(optimizerActions.optimizerCampaignId, testOptimizerCampaignId))

      expect(savedActions[0].executed).toBe(true)
      expect(savedActions[0].executedAt).toBeDefined()
      expect(savedActions[0].error).toBeNull()
    })

    it('should record error on failure', async () => {
      const mockSource = {
        blacklistWidget: vi.fn().mockRejectedValue(new Error('API failed')),
      }
      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      const actions: GeneratedAction[] = [{
        ruleId: null,
        ruleName: 'Record Error Test',
        actionType: 'blacklist',
        targetType: 'widget',
        targetId: 'w1',
        targetName: 'Bad Widget',
        reason: 'Test',
        metrics: {},
        confidenceScore: 0.9,
      }]

      const results = await executor.executeActions(
        actions,
        testOptimizerCampaignId,
        testSourceAccountId,
        'ext-123'
      )

      expect(results[0].success).toBe(false)
      expect(results[0].error).toBe('API failed')

      const savedActions = await db.select()
        .from(optimizerActions)
        .where(eq(optimizerActions.optimizerCampaignId, testOptimizerCampaignId))

      expect(savedActions[0].executed).toBe(false)
      expect(savedActions[0].error).toBe('API failed')
    })

    it('should handle authentication failure', async () => {
      vi.mocked(getAuthenticatedSource).mockRejectedValue(new Error('Auth failed'))

      const actions: GeneratedAction[] = [{
        ruleId: null,
        ruleName: 'Auth Failure Test',
        actionType: 'blacklist',
        targetType: 'widget',
        targetId: 'w1',
        targetName: 'Bad Widget',
        reason: 'Test',
        metrics: {},
        confidenceScore: 0.9,
      }]

      const results = await executor.executeActions(
        actions,
        testOptimizerCampaignId,
        testSourceAccountId,
        'ext-123'
      )

      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(false)
      expect(results[0].error).toBe('Failed to authenticate source')
    })

    it('should process multiple actions', async () => {
      const mockSource = {
        blacklistWidget: vi.fn().mockResolvedValue({ success: true, widgetId: 'w1' }),
        adjustWidgetBid: vi.fn().mockResolvedValue({ success: true, widgetId: 'w2' }),
      }
      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      const actions: GeneratedAction[] = [
        {
          ruleId: null,
          ruleName: 'Blacklist Rule',
          actionType: 'blacklist',
          targetType: 'widget',
          targetId: 'w1',
          targetName: 'Widget 1',
          reason: 'Blacklist',
          metrics: {},
          confidenceScore: 0.9,
        },
        {
          ruleId: null,
          ruleName: 'Bid Increase Rule',
          actionType: 'bid_increase',
          targetType: 'widget',
          targetId: 'w2',
          targetName: 'Widget 2',
          previousValue: 0.5,
          newValue: 0.6,
          reason: 'Good CPA',
          metrics: {},
          confidenceScore: 0.85,
        },
      ]

      const results = await executor.executeActions(
        actions,
        testOptimizerCampaignId,
        testSourceAccountId,
        'ext-123'
      )

      expect(results).toHaveLength(2)
      expect(results.filter((r) => r.success)).toHaveLength(2)
      expect(mockSource.blacklistWidget).toHaveBeenCalledTimes(1)
      expect(mockSource.adjustWidgetBid).toHaveBeenCalledTimes(1)
    })

    it('should throw error for bid action without newValue', async () => {
      const mockSource = {
        adjustWidgetBid: vi.fn(),
      }
      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      const actions: GeneratedAction[] = [{
        ruleId: null,
        ruleName: 'Missing Bid Value Test',
        actionType: 'bid_increase',
        targetType: 'widget',
        targetId: 'w1',
        targetName: 'Widget',
        // newValue is undefined
        reason: 'Test',
        metrics: {},
        confidenceScore: 0.9,
      }]

      const results = await executor.executeActions(
        actions,
        testOptimizerCampaignId,
        testSourceAccountId,
        'ext-123'
      )

      expect(results[0].success).toBe(false)
      expect(results[0].error).toBe('No new bid value specified')
    })
  })
})
