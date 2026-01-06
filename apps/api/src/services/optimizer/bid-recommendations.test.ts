/**
 * Bid Recommendations Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BidRecommendationsService } from './bid-recommendations.service.js'

// Mock dependencies
vi.mock('../../lib/db.js', () => ({
  db: {
    select: vi.fn(),
  },
}))

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('BidRecommendationsService', () => {
  let service: BidRecommendationsService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new BidRecommendationsService()
  })

  describe('analyzePerformance (private method via generateRecommendations)', () => {
    it('should recommend bid reduction for high CPA', async () => {
      const { db } = await import('../../lib/db.js')

      // Mock performance data with high CPA
      const mockSyncs = [
        { spend: '200', conversions: 2, impressions: 10000, clicks: 200, campaignName: 'Test Campaign' },
        { spend: '180', conversions: 2, impressions: 9500, clicks: 190, campaignName: 'Test Campaign' },
        { spend: '170', conversions: 2, impressions: 9200, clicks: 185, campaignName: 'Test Campaign' },
        { spend: '160', conversions: 2, impressions: 9000, clicks: 180, campaignName: 'Test Campaign' },
      ]

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockSyncs),
          }),
        }),
      })

      // Target CPA = $25, actual CPA = $100 (4x target)
      const recommendations = await service.generateRecommendations({
        sourceAccountId: 'test-account',
        externalCampaignId: 'test-campaign',
        targetCpa: 25,
      })

      expect(recommendations.length).toBe(1)
      expect(recommendations[0].changePercent).toBeLessThan(0) // Should recommend decrease
      expect(recommendations[0].reason).toContain('CPA')
    })

    it('should recommend bid increase for low CPA performers', async () => {
      const { db } = await import('../../lib/db.js')

      // Mock performance data with low CPA
      const mockSyncs = [
        { spend: '100', conversions: 10, impressions: 10000, clicks: 200, campaignName: 'Test Campaign' },
        { spend: '90', conversions: 9, impressions: 9500, clicks: 190, campaignName: 'Test Campaign' },
        { spend: '85', conversions: 9, impressions: 9200, clicks: 185, campaignName: 'Test Campaign' },
        { spend: '80', conversions: 8, impressions: 9000, clicks: 180, campaignName: 'Test Campaign' },
      ]

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockSyncs),
          }),
        }),
      })

      // Target CPA = $50, actual CPA = $10 (well below target)
      const recommendations = await service.generateRecommendations({
        sourceAccountId: 'test-account',
        externalCampaignId: 'test-campaign',
        targetCpa: 50,
      })

      expect(recommendations.length).toBe(1)
      expect(recommendations[0].changePercent).toBeGreaterThan(0) // Should recommend increase
      expect(recommendations[0].reason).toContain('Strong performer')
    })

    it('should recommend pause for zero conversions with spend', async () => {
      const { db } = await import('../../lib/db.js')

      // Mock performance data with no conversions but high spend
      const mockSyncs = [
        { spend: '200', conversions: 0, impressions: 10000, clicks: 200, campaignName: 'Test Campaign' },
        { spend: '180', conversions: 0, impressions: 9500, clicks: 190, campaignName: 'Test Campaign' },
        { spend: '170', conversions: 0, impressions: 9200, clicks: 185, campaignName: 'Test Campaign' },
        { spend: '160', conversions: 0, impressions: 9000, clicks: 180, campaignName: 'Test Campaign' },
      ]

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockSyncs),
          }),
        }),
      })

      // Target CPA = $25, but no conversions with $710 spend
      const recommendations = await service.generateRecommendations({
        sourceAccountId: 'test-account',
        externalCampaignId: 'test-campaign',
        targetCpa: 25,
      })

      expect(recommendations.length).toBe(1)
      expect(recommendations[0].changePercent).toBe(-100) // Should recommend pause
      expect(recommendations[0].reason).toContain('No conversions')
    })

    it('should return empty array for insufficient data', async () => {
      const { db } = await import('../../lib/db.js')

      // Only 2 syncs - below minimum
      const mockSyncs = [
        { spend: '100', conversions: 5, impressions: 10000, clicks: 200, campaignName: 'Test Campaign' },
        { spend: '90', conversions: 4, impressions: 9500, clicks: 190, campaignName: 'Test Campaign' },
      ]

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockSyncs),
          }),
        }),
      })

      const recommendations = await service.generateRecommendations({
        sourceAccountId: 'test-account',
        externalCampaignId: 'test-campaign',
        targetCpa: 25,
      })

      expect(recommendations).toHaveLength(0)
    })
  })

  describe('summarizeRecommendations', () => {
    it('should categorize recommendations correctly', () => {
      const recommendations = [
        { placementId: '1', placementName: 'P1', currentBid: null, recommendedBid: 0, changePercent: 20, reason: '', confidence: 'high' as const, metrics: { spend: 100, conversions: 5, cpa: 20, impressions: 1000, clicks: 50, ctr: 5 } },
        { placementId: '2', placementName: 'P2', currentBid: null, recommendedBid: 0, changePercent: -30, reason: '', confidence: 'medium' as const, metrics: { spend: 100, conversions: 5, cpa: 20, impressions: 1000, clicks: 50, ctr: 5 } },
        { placementId: '3', placementName: 'P3', currentBid: null, recommendedBid: 0, changePercent: -100, reason: '', confidence: 'high' as const, metrics: { spend: 100, conversions: 5, cpa: 20, impressions: 1000, clicks: 50, ctr: 5 } },
        { placementId: '4', placementName: 'P4', currentBid: null, recommendedBid: 0, changePercent: 15, reason: '', confidence: 'low' as const, metrics: { spend: 100, conversions: 5, cpa: 20, impressions: 1000, clicks: 50, ctr: 5 } },
      ]

      const summary = service.summarizeRecommendations(recommendations)

      expect(summary.total).toBe(4)
      expect(summary.increases).toBe(2)
      expect(summary.decreases).toBe(1)
      expect(summary.pauses).toBe(1)
      expect(summary.highConfidence).toBe(2)
    })
  })
})
