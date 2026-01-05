/**
 * Taboola Optimizer Adapter
 *
 * Wraps TaboolaSource with optimizer-specific functionality:
 * - Sites terminology (called "sites" in Taboola)
 * - Max 1,500 sites blocked per campaign
 * - Real-time reporting available
 * - Supports per-site bid modifiers
 */

import type {
  OptimizerAdapter,
  PlacementMetrics,
  BlockResult,
  BidResult,
  SourceConstraints,
  GetPlacementsParams,
  BlockPlacementParams,
  AdjustBidParams,
} from './interface.js'
import { normalizeWidgetToPlacement } from './interface.js'
import type { TaboolaSource } from '../../../traffic-sources/taboola/index.js'
import { logger } from '../../../lib/logger.js'

export class TaboolaOptimizerAdapter implements OptimizerAdapter {
  readonly sourceId = 'taboola'

  constructor(private source: TaboolaSource) {}

  async getPlacementsWithMetrics(params: GetPlacementsParams): Promise<PlacementMetrics[]> {
    logger.debug({ campaignId: params.campaignId, from: params.from, to: params.to }, 'Taboola: Fetching placements')

    // Taboola calls placements "sites"
    const widgets = await this.source.getWidgets({ campaignId: params.campaignId })

    return widgets.map((widget) => normalizeWidgetToPlacement(widget))
  }

  async blockPlacement(params: BlockPlacementParams): Promise<BlockResult> {
    logger.info(
      { campaignId: params.campaignId, placementId: params.placementId, reason: params.reason },
      'Taboola: Blocking site'
    )

    try {
      const result = await this.source.blacklistWidget(params.campaignId, params.placementId)

      if (result.success) {
        logger.info({ placementId: params.placementId }, 'Taboola: Site blocked successfully')
      } else {
        logger.warn({ placementId: params.placementId, error: result.error }, 'Taboola: Failed to block site')
      }

      return {
        success: result.success,
        placementId: params.placementId,
        error: result.error,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      logger.error({ placementId: params.placementId, error }, 'Taboola: Error blocking site')
      return {
        success: false,
        placementId: params.placementId,
        error,
      }
    }
  }

  async adjustPlacementBid(params: AdjustBidParams): Promise<BidResult> {
    logger.info(
      { campaignId: params.campaignId, placementId: params.placementId, newBid: params.newBid },
      'Taboola: Adjusting site bid modifier'
    )

    try {
      const result = await this.source.adjustWidgetBid(params.campaignId, params.placementId, params.newBid)

      if (result.success) {
        logger.info(
          { placementId: params.placementId, previousBid: result.previousBid, newBid: result.newBid },
          'Taboola: Bid modifier adjusted successfully'
        )
      } else {
        logger.warn({ placementId: params.placementId, error: result.error }, 'Taboola: Failed to adjust bid modifier')
      }

      return {
        success: result.success,
        placementId: params.placementId,
        previousBid: result.previousBid,
        newBid: result.newBid,
        error: result.error,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      logger.error({ placementId: params.placementId, error }, 'Taboola: Error adjusting bid modifier')
      return {
        success: false,
        placementId: params.placementId,
        previousBid: params.previousBid || 0,
        newBid: params.newBid,
        error,
      }
    }
  }

  getConstraints(): SourceConstraints {
    return {
      // Taboola allows max 1,500 sites blocked per campaign
      maxBlocksPerCampaign: 1500,
      // No specific minimum threshold for Taboola
      minBlockThreshold: 50,
      // Taboola provides real-time data
      reportingDelayHours: 0,
      // Taboola rate limit: 60 requests per minute (10 per second with bursts)
      rateLimit: { requestsPerMinute: 60 },
      // Taboola supports per-site bid modifiers
      supportsDirectBidAdjust: true,
      // Taboola calls them "sites"
      placementTerminology: 'site',
    }
  }
}
