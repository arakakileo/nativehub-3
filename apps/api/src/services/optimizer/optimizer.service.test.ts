import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '../../lib/db.js'
import { sourceAccounts, optimizerCampaigns, optimizerRules, widgetBlacklist } from '../../db/schema.js'
import { encryptCredentials } from '../../lib/crypto.js'
import { TEST_USER_ID } from '../../test/fixtures/index.js'
import { eq, and } from 'drizzle-orm'

// Mock getAuthenticatedSource
vi.mock('../../traffic-sources/index.js', () => ({
  getAuthenticatedSource: vi.fn(),
}))

// Mock hasOptimizerSupport to control test flow
vi.mock('./adapters/index.js', () => ({
  hasOptimizerSupport: vi.fn(),
  createOptimizerAdapter: vi.fn(),
}))

// Import service after mocking
const { optimizerService } = await import('./optimizer.service.js')
import { getAuthenticatedSource } from '../../traffic-sources/index.js'
import { hasOptimizerSupport, createOptimizerAdapter } from './adapters/index.js'

describe('OptimizerService', () => {
  let testSourceAccountId: string

  beforeEach(async () => {
    vi.clearAllMocks()

    // Create a test source account
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
  })

  describe('getOrCreateOptimizerCampaign', () => {
    it('should create a new optimizer campaign', async () => {
      const campaign = await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-campaign-123',
        5.00
      )

      expect(campaign).toBeDefined()
      expect(campaign.sourceAccountId).toBe(testSourceAccountId)
      expect(campaign.externalCampaignId).toBe('ext-campaign-123')
      expect(campaign.targetCpa).toBe('5')
      expect(campaign.enabled).toBe(true)
    })

    it('should return existing campaign if already exists', async () => {
      // Create first campaign
      const campaign1 = await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-campaign-123',
        5.00
      )

      // Try to create again
      const campaign2 = await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-campaign-123',
        10.00  // Different target CPA
      )

      expect(campaign2.id).toBe(campaign1.id)
      expect(campaign2.targetCpa).toBe('5')  // Original value preserved
    })

    it('should add default rules to new campaign', async () => {
      const campaign = await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-campaign-new',
        5.00
      )

      const rules = await db.select()
        .from(optimizerRules)
        .where(eq(optimizerRules.optimizerCampaignId, campaign.id))

      // Should have 4 default rules
      expect(rules.length).toBe(4)

      // Check rule templates
      const templateIds = rules.map((r) => r.templateId)
      expect(templateIds).toContain('blacklist_no_conv')
      expect(templateIds).toContain('blacklist_high_cpa')
      expect(templateIds).toContain('raise_bid_good_cpa')
      expect(templateIds).toContain('lower_bid_bad_cpa')
    })

    it('should set correct priorities for default rules', async () => {
      const campaign = await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-campaign-priority',
        5.00
      )

      const rules = await db.select()
        .from(optimizerRules)
        .where(eq(optimizerRules.optimizerCampaignId, campaign.id))
        .orderBy(optimizerRules.priority)

      // Rules should have priorities 1, 2, 3, 4
      expect(rules.map((r) => r.priority)).toEqual([1, 2, 3, 4])
    })
  })

  describe('getRules', () => {
    it('should return rules for a campaign ordered by priority', async () => {
      // Create campaign with rules
      const campaign = await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-campaign-rules',
        5.00
      )

      const rules = await optimizerService.getRules(campaign.id)

      expect(rules.length).toBe(4)
      // Should be ordered by priority
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i].priority).toBeGreaterThanOrEqual(rules[i - 1].priority)
      }
    })

    it('should return empty array for campaign with no rules', async () => {
      // Create campaign without default rules by inserting directly
      const [campaign] = await db.insert(optimizerCampaigns).values({
        sourceAccountId: testSourceAccountId,
        externalCampaignId: 'ext-no-rules',
        enabled: true,
        targetCpa: '5.00',
        bidStrategy: 'target_cpa',
        bidStrategyConfig: {},
      }).returning()

      const rules = await optimizerService.getRules(campaign.id)

      expect(rules).toHaveLength(0)
    })
  })

  describe('getRecentActions', () => {
    it('should return empty array when no actions', async () => {
      const campaign = await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-campaign-actions',
        5.00
      )

      const actions = await optimizerService.getRecentActions(campaign.id)

      expect(actions).toHaveLength(0)
    })

    it('should respect limit parameter', async () => {
      const campaign = await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-campaign-limit',
        5.00
      )

      // Default limit should be 50
      const actions = await optimizerService.getRecentActions(campaign.id, 10)

      expect(actions.length).toBeLessThanOrEqual(10)
    })
  })

  describe('optimizeCampaign', () => {
    it('should return 0 actions for disabled campaign', async () => {
      // Create disabled campaign
      const [campaign] = await db.insert(optimizerCampaigns).values({
        sourceAccountId: testSourceAccountId,
        externalCampaignId: 'ext-disabled',
        enabled: false,
        targetCpa: '5.00',
        bidStrategy: 'target_cpa',
        bidStrategyConfig: {},
      }).returning()

      const result = await optimizerService.optimizeCampaign(campaign.id)

      expect(result.actionsGenerated).toBe(0)
      expect(result.actionsExecuted).toBe(0)
    })

    it('should return 0 actions for campaign with no rules', async () => {
      const [campaign] = await db.insert(optimizerCampaigns).values({
        sourceAccountId: testSourceAccountId,
        externalCampaignId: 'ext-no-rules',
        enabled: true,
        targetCpa: '5.00',
        bidStrategy: 'target_cpa',
        bidStrategyConfig: {},
      }).returning()

      const result = await optimizerService.optimizeCampaign(campaign.id)

      expect(result.actionsGenerated).toBe(0)
      expect(result.actionsExecuted).toBe(0)
    })

    it('should fetch widgets and generate actions', async () => {
      // Create campaign with rules
      const campaign = await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-optimize',
        5.00
      )

      // Mock the traffic source
      const mockSource = {
        getWidgets: vi.fn().mockResolvedValue([
          {
            id: 'widget-1',
            externalId: 'w1',
            name: 'Bad Widget',
            domain: 'bad.com',
            enabled: true,
            metrics: {
              spend: 150,
              impressions: 10000,
              clicks: 100,
              conversions: 0,
              ctr: 1,
              cpa: 0,
              cpc: 1.5,
            },
          },
        ]),
        blacklistWidget: vi.fn().mockResolvedValue({ success: true, widgetId: 'w1' }),
      }

      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      const result = await optimizerService.optimizeCampaign(campaign.id)

      // Should have generated action for widget with high spend and 0 conversions
      expect(result.actionsGenerated).toBeGreaterThanOrEqual(1)
      expect(mockSource.getWidgets).toHaveBeenCalled()
    })

    it('should return 0 when no widgets match rules', async () => {
      const campaign = await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-no-match',
        5.00
      )

      // Mock with a "good" widget that doesn't match any rules
      const mockSource = {
        getWidgets: vi.fn().mockResolvedValue([
          {
            id: 'widget-good',
            externalId: 'wg',
            name: 'Good Widget',
            domain: 'good.com',
            enabled: true,
            metrics: {
              spend: 10,  // Too low to trigger any rules
              impressions: 1000,
              clicks: 50,
              conversions: 2,
              ctr: 5,
              cpa: 5,
              cpc: 0.2,
            },
          },
        ]),
      }

      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      const result = await optimizerService.optimizeCampaign(campaign.id)

      expect(result.actionsGenerated).toBe(0)
      expect(result.actionsExecuted).toBe(0)
    })
  })

  describe('optimizeAll', () => {
    it('should process all enabled campaigns', async () => {
      // Create two enabled campaigns
      await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-all-1',
        5.00
      )
      await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-all-2',
        5.00
      )

      // Create one disabled campaign
      await db.insert(optimizerCampaigns).values({
        sourceAccountId: testSourceAccountId,
        externalCampaignId: 'ext-disabled',
        enabled: false,
        targetCpa: '5.00',
        bidStrategy: 'target_cpa',
        bidStrategyConfig: {},
      })

      // Mock to return no widgets
      const mockSource = {
        getWidgets: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      const result = await optimizerService.optimizeAll()

      // Should process 2 enabled campaigns
      expect(result.campaignsProcessed).toBe(2)
    })

    it('should continue processing after error in one campaign', async () => {
      await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-error',
        5.00
      )
      await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-success',
        5.00
      )

      // Mock first call to fail, second to succeed
      const mockSource = {
        getWidgets: vi.fn()
          .mockRejectedValueOnce(new Error('API Error'))
          .mockResolvedValueOnce([]),
      }
      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      // Should not throw
      const result = await optimizerService.optimizeAll()

      expect(result.campaignsProcessed).toBe(2)
    })
  })

  describe('optimizeCampaignSourceAware', () => {
    it('should fall back to legacy when source has no optimizer support', async () => {
      const campaign = await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-legacy-fallback',
        5.00
      )

      // Mock no optimizer support
      vi.mocked(hasOptimizerSupport).mockReturnValue(false)

      // Mock legacy source behavior
      const mockSource = {
        getWidgets: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(getAuthenticatedSource).mockResolvedValue(mockSource as never)

      const result = await optimizerService.optimizeCampaignSourceAware(campaign.id)

      expect(hasOptimizerSupport).toHaveBeenCalled()
      // Falls back to legacy, which returns 0 when no widgets
      expect(result.actionsGenerated).toBe(0)
      expect(result.actionsExecuted).toBe(0)
    })

    it('should use source-aware components when adapter available', async () => {
      // Create campaign
      const campaign = await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-source-aware',
        5.00
      )

      // Mock optimizer support
      vi.mocked(hasOptimizerSupport).mockReturnValue(true)

      // Mock adapter
      const mockAdapter = {
        getConstraints: vi.fn().mockReturnValue({
          minBid: 0.01,
          maxBid: 10.00,
          bidIncrement: 0.01,
          bidUnit: 'cpc',
          maxBlockedPlacements: 1500,
          supportsBulkBlock: true,
          supportsPlacementBidModifier: true,
        }),
        getPlacementsWithMetrics: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(createOptimizerAdapter).mockReturnValue(mockAdapter as never)

      // Mock authenticated source
      vi.mocked(getAuthenticatedSource).mockResolvedValue({} as never)

      const result = await optimizerService.optimizeCampaignSourceAware(campaign.id)

      expect(hasOptimizerSupport).toHaveBeenCalledWith('revcontent')
      expect(createOptimizerAdapter).toHaveBeenCalled()
      expect(mockAdapter.getConstraints).toHaveBeenCalled()
      expect(mockAdapter.getPlacementsWithMetrics).toHaveBeenCalled()
      expect(result.actionsGenerated).toBe(0)
      expect(result.actionsExecuted).toBe(0)
      expect(result.actionsFailed).toBe(0)
      expect(result.skipped).toBe(0)
    })

    it('should return early for disabled campaign', async () => {
      // Create disabled campaign directly
      const [campaign] = await db.insert(optimizerCampaigns).values({
        sourceAccountId: testSourceAccountId,
        externalCampaignId: 'ext-disabled-aware',
        enabled: false,
        targetCpa: '5.00',
        bidStrategy: 'target_cpa',
        bidStrategyConfig: {},
      }).returning()

      const result = await optimizerService.optimizeCampaignSourceAware(campaign.id)

      expect(result.actionsGenerated).toBe(0)
      expect(result.actionsExecuted).toBe(0)
      expect(result.actionsFailed).toBe(0)
      expect(result.skipped).toBe(0)
    })

    it('should return optimization stats even when no actions generated', async () => {
      const campaign = await optimizerService.getOrCreateOptimizerCampaign(
        testSourceAccountId,
        'ext-lastrun-update',
        5.00
      )

      vi.mocked(hasOptimizerSupport).mockReturnValue(true)

      // Mock adapter with placements - note: the placement doesn't match
      // any rules since spend=100 is below threshold and no other conditions met
      const mockAdapter = {
        sourceId: 'revcontent',
        getConstraints: vi.fn().mockReturnValue({
          minBid: 0.01,
          maxBid: 10.00,
          bidIncrement: 0.01,
          bidUnit: 'cpc',
          maxBlockedPlacements: 1500,
          supportsBulkBlock: true,
          supportsPlacementBidModifier: true,
        }),
        getPlacementsWithMetrics: vi.fn().mockResolvedValue([
          {
            id: 'placement-1',
            sourceId: 'revcontent',
            externalId: 'p1',
            name: 'Test Placement',
            type: 'widget',
            enabled: true,
            metrics: {
              spend: 10, // Low spend - won't trigger rules
              impressions: 1000,
              clicks: 100,
              conversions: 2, // Has conversions - won't trigger blacklist
              ctr: 10,
              cpa: 5,
              cpc: 0.1,
            },
          },
        ]),
        blockPlacements: vi.fn().mockResolvedValue({ success: ['p1'], failed: [] }),
      }
      vi.mocked(createOptimizerAdapter).mockReturnValue(mockAdapter as never)
      vi.mocked(getAuthenticatedSource).mockResolvedValue({} as never)

      const result = await optimizerService.optimizeCampaignSourceAware(campaign.id)

      // The result should reflect the optimization run stats
      expect(result).toHaveProperty('actionsGenerated')
      expect(result).toHaveProperty('actionsExecuted')
      expect(result).toHaveProperty('actionsFailed')
      expect(result).toHaveProperty('skipped')

      // With no actions generated (placement doesn't match rules),
      // lastRun fields remain null
      expect(result.actionsGenerated).toBe(0)
      expect(result.actionsExecuted).toBe(0)
    })
  })

  describe('addSourceAwareDefaultRules', () => {
    it('should add source-specific template rules', async () => {
      // Create campaign without default rules
      const [campaign] = await db.insert(optimizerCampaigns).values({
        sourceAccountId: testSourceAccountId,
        externalCampaignId: 'ext-source-rules',
        enabled: true,
        targetCpa: '5.00',
        bidStrategy: 'target_cpa',
        bidStrategyConfig: {},
      }).returning()

      await optimizerService.addSourceAwareDefaultRules(campaign.id, 'revcontent')

      const rules = await db
        .select()
        .from(optimizerRules)
        .where(eq(optimizerRules.optimizerCampaignId, campaign.id))

      // Should have added at least some rules
      expect(rules.length).toBeGreaterThan(0)
      // Rules should be enabled
      expect(rules.every((r) => r.enabled)).toBe(true)
      // Rules should have priorities
      expect(rules.every((r) => r.priority > 0)).toBe(true)
    })

    it('should handle sources with no specific templates gracefully', async () => {
      const [campaign] = await db.insert(optimizerCampaigns).values({
        sourceAccountId: testSourceAccountId,
        externalCampaignId: 'ext-unknown-source',
        enabled: true,
        targetCpa: '5.00',
        bidStrategy: 'target_cpa',
        bidStrategyConfig: {},
      }).returning()

      // Should not throw for unknown source
      await expect(
        optimizerService.addSourceAwareDefaultRules(campaign.id, 'unknown-source')
      ).resolves.not.toThrow()
    })
  })
})
