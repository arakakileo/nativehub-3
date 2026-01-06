/**
 * Smart Bid Recommendations Service
 *
 * Analyzes historical performance data to suggest optimal bid adjustments.
 * Uses statistical analysis to identify:
 * - Underperforming placements that need bid reduction
 * - High-performing placements that could scale with bid increases
 * - Optimal bid ranges based on conversion patterns
 */

import { db } from '../../lib/db.js'
import { campaignSyncs, optimizerActions } from '../../db/schema.js'
import { logger } from '../../lib/logger.js'
import { eq, and, gte, lt, sql, desc } from 'drizzle-orm'

export interface BidRecommendation {
  placementId: string
  placementName: string
  currentBid: number | null
  recommendedBid: number
  changePercent: number
  reason: string
  confidence: 'high' | 'medium' | 'low'
  metrics: {
    spend: number
    conversions: number
    cpa: number
    impressions: number
    clicks: number
    ctr: number
  }
}

export interface PlacementPerformance {
  placementId: string
  placementName: string
  spend: number
  conversions: number
  impressions: number
  clicks: number
  cpa: number
  ctr: number
  dataPoints: number
}

/**
 * Smart Bid Recommendations Service
 */
export class BidRecommendationsService {
  private readonly MIN_DATA_POINTS = 3 // Minimum syncs for reliable recommendation
  private readonly MIN_SPEND_THRESHOLD = 10 // Minimum spend to consider
  private readonly HIGH_CPA_MULTIPLIER = 2.0 // 2x target = reduce bid
  private readonly LOW_CPA_MULTIPLIER = 0.5 // 0.5x target = increase bid
  private readonly MAX_BID_CHANGE = 0.5 // Max 50% change per recommendation

  /**
   * Generate bid recommendations for a campaign
   */
  async generateRecommendations(params: {
    sourceAccountId: string
    externalCampaignId: string
    targetCpa: number
    lookbackDays?: number
  }): Promise<BidRecommendation[]> {
    const { sourceAccountId, externalCampaignId, targetCpa, lookbackDays = 7 } = params

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - lookbackDays)

    try {
      // Get placement-level performance data
      const performanceData = await this.getPlacementPerformance({
        sourceAccountId,
        externalCampaignId,
        startDate,
      })

      const recommendations: BidRecommendation[] = []

      for (const placement of performanceData) {
        // Skip if insufficient data
        if (placement.dataPoints < this.MIN_DATA_POINTS) {
          continue
        }

        // Skip if too little spend
        if (placement.spend < this.MIN_SPEND_THRESHOLD) {
          continue
        }

        const recommendation = this.analyzePerformance(placement, targetCpa)
        if (recommendation) {
          recommendations.push(recommendation)
        }
      }

      // Sort by confidence and potential impact
      recommendations.sort((a, b) => {
        const confidenceOrder = { high: 0, medium: 1, low: 2 }
        if (confidenceOrder[a.confidence] !== confidenceOrder[b.confidence]) {
          return confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
        }
        return Math.abs(b.changePercent) - Math.abs(a.changePercent)
      })

      logger.info({
        sourceAccountId,
        externalCampaignId,
        recommendationsCount: recommendations.length,
      }, 'Generated bid recommendations')

      return recommendations
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg }, 'Failed to generate bid recommendations')
      throw error
    }
  }

  /**
   * Aggregate placement-level performance from campaign syncs
   */
  private async getPlacementPerformance(params: {
    sourceAccountId: string
    externalCampaignId: string
    startDate: Date
  }): Promise<PlacementPerformance[]> {
    const { sourceAccountId, externalCampaignId, startDate } = params

    // Get recent campaign syncs with placement data
    const syncs = await db
      .select()
      .from(campaignSyncs)
      .where(and(
        eq(campaignSyncs.sourceAccountId, sourceAccountId),
        eq(campaignSyncs.externalCampaignId, externalCampaignId),
        gte(campaignSyncs.syncedAt, startDate)
      ))
      .orderBy(desc(campaignSyncs.syncedAt))

    // Aggregate by placement (using widgetId from sync data if available)
    // For now, return campaign-level aggregates
    const aggregated: PlacementPerformance[] = []

    if (syncs.length > 0) {
      const totalSpend = syncs.reduce((sum, s) => sum + Number(s.spend || 0), 0)
      const totalConversions = syncs.reduce((sum, s) => sum + (s.conversions || 0), 0)
      const totalImpressions = syncs.reduce((sum, s) => sum + Number(s.impressions || 0), 0)
      const totalClicks = syncs.reduce((sum, s) => sum + Number(s.clicks || 0), 0)

      aggregated.push({
        placementId: externalCampaignId,
        placementName: syncs[0].campaignName || externalCampaignId,
        spend: totalSpend,
        conversions: totalConversions,
        impressions: totalImpressions,
        clicks: totalClicks,
        cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        dataPoints: syncs.length,
      })
    }

    return aggregated
  }

  /**
   * Analyze performance and generate recommendation
   */
  private analyzePerformance(
    placement: PlacementPerformance,
    targetCpa: number
  ): BidRecommendation | null {
    const { cpa, conversions, spend, ctr } = placement

    // No conversions yet - can't make reliable recommendation
    if (conversions === 0 && spend > targetCpa * 2) {
      return {
        placementId: placement.placementId,
        placementName: placement.placementName,
        currentBid: null,
        recommendedBid: 0, // Suggest pause
        changePercent: -100,
        reason: `No conversions after spending $${spend.toFixed(2)} (${(spend / targetCpa).toFixed(1)}x target CPA)`,
        confidence: spend > targetCpa * 3 ? 'high' : 'medium',
        metrics: {
          spend,
          conversions,
          cpa,
          impressions: placement.impressions,
          clicks: placement.clicks,
          ctr,
        },
      }
    }

    // Skip if no conversions and low spend
    if (conversions === 0) {
      return null
    }

    // Calculate CPA ratio
    const cpaRatio = cpa / targetCpa

    // High CPA - recommend bid decrease
    if (cpaRatio > this.HIGH_CPA_MULTIPLIER) {
      const reductionPercent = Math.min(
        (1 - (targetCpa / cpa)) * 0.5, // Reduce proportionally, halved for safety
        this.MAX_BID_CHANGE
      )

      return {
        placementId: placement.placementId,
        placementName: placement.placementName,
        currentBid: null,
        recommendedBid: 0, // Will be calculated by caller with current bid
        changePercent: -reductionPercent * 100,
        reason: `CPA $${cpa.toFixed(2)} is ${cpaRatio.toFixed(1)}x target ($${targetCpa.toFixed(2)})`,
        confidence: this.calculateConfidence(placement),
        metrics: {
          spend,
          conversions,
          cpa,
          impressions: placement.impressions,
          clicks: placement.clicks,
          ctr,
        },
      }
    }

    // Low CPA - recommend bid increase (scaling opportunity)
    if (cpaRatio < this.LOW_CPA_MULTIPLIER && conversions >= 3) {
      const increasePercent = Math.min(
        ((targetCpa / cpa) - 1) * 0.3, // Increase conservatively
        this.MAX_BID_CHANGE
      )

      return {
        placementId: placement.placementId,
        placementName: placement.placementName,
        currentBid: null,
        recommendedBid: 0,
        changePercent: increasePercent * 100,
        reason: `Strong performer: CPA $${cpa.toFixed(2)} is ${(100 - cpaRatio * 100).toFixed(0)}% below target`,
        confidence: this.calculateConfidence(placement),
        metrics: {
          spend,
          conversions,
          cpa,
          impressions: placement.impressions,
          clicks: placement.clicks,
          ctr,
        },
      }
    }

    return null // No recommendation needed - performing within acceptable range
  }

  /**
   * Calculate confidence level based on data quality
   */
  private calculateConfidence(placement: PlacementPerformance): 'high' | 'medium' | 'low' {
    if (placement.conversions >= 10 && placement.dataPoints >= 5) {
      return 'high'
    }
    if (placement.conversions >= 5 && placement.dataPoints >= 3) {
      return 'medium'
    }
    return 'low'
  }

  /**
   * Get summary of recommendation types
   */
  summarizeRecommendations(recommendations: BidRecommendation[]): {
    total: number
    increases: number
    decreases: number
    pauses: number
    highConfidence: number
  } {
    return {
      total: recommendations.length,
      increases: recommendations.filter(r => r.changePercent > 0).length,
      decreases: recommendations.filter(r => r.changePercent < 0 && r.changePercent > -100).length,
      pauses: recommendations.filter(r => r.changePercent === -100).length,
      highConfidence: recommendations.filter(r => r.confidence === 'high').length,
    }
  }
}

// Singleton instance
export const bidRecommendationsService = new BidRecommendationsService()
