/**
 * Revcontent Optimizer Adapter
 *
 * Wraps RevcontentSource with optimizer-specific functionality:
 * - Widgets terminology (campaigns are called "Boosts")
 * - Supports per-widget bid adjustments
 * - Uses enabled/disabled for blocking
 */

import type {
  OptimizerAdapter,
  PlacementMetrics,
  BlockResult,
  BidResult,
  EnableResult,
  SourceConstraints,
  GetPlacementsParams,
  BlockPlacementParams,
  AdjustBidParams,
  EnablePlacementParams,
} from './interface.js'
import { normalizeWidgetToPlacement } from './interface.js'
import type { RevcontentSource } from '../../../traffic-sources/revcontent/index.js'
import { logger } from '../../../lib/logger.js'

export class RevcontentOptimizerAdapter implements OptimizerAdapter {
  readonly sourceId = 'revcontent'

  constructor(private source: RevcontentSource) {}

  async getPlacementsWithMetrics(params: GetPlacementsParams): Promise<PlacementMetrics[]> {
    logger.debug({ campaignId: params.campaignId, from: params.from, to: params.to }, 'Revcontent: Fetching placements')

    // Revcontent uses "widgets" (campaigns are "Boosts")
    const widgets = await this.source.getWidgets({ campaignId: params.campaignId })

    return widgets.map((widget) => ({
      ...normalizeWidgetToPlacement(widget),
      metadata: { domain: widget.domain },
    }))
  }

  async blockPlacement(params: BlockPlacementParams): Promise<BlockResult> {
    logger.info(
      { campaignId: params.campaignId, placementId: params.placementId, reason: params.reason },
      'Revcontent: Blocking widget'
    )

    try {
      const result = await this.source.blacklistWidget(params.campaignId, params.placementId)

      if (result.success) {
        logger.info({ placementId: params.placementId }, 'Revcontent: Widget blocked successfully')
      } else {
        logger.warn({ placementId: params.placementId, error: result.error }, 'Revcontent: Failed to block widget')
      }

      return {
        success: result.success,
        placementId: params.placementId,
        error: result.error,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      logger.error({ placementId: params.placementId, error }, 'Revcontent: Error blocking widget')
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
      'Revcontent: Adjusting widget bid'
    )

    try {
      const result = await this.source.adjustWidgetBid(params.campaignId, params.placementId, params.newBid)

      if (result.success) {
        logger.info(
          { placementId: params.placementId, previousBid: result.previousBid, newBid: result.newBid },
          'Revcontent: Bid adjusted successfully'
        )
      } else {
        logger.warn({ placementId: params.placementId, error: result.error }, 'Revcontent: Failed to adjust bid')
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
      logger.error({ placementId: params.placementId, error }, 'Revcontent: Error adjusting bid')
      return {
        success: false,
        placementId: params.placementId,
        previousBid: params.previousBid || 0,
        newBid: params.newBid,
        error,
      }
    }
  }

  async enablePlacement(params: EnablePlacementParams): Promise<EnableResult> {
    logger.info(
      { campaignId: params.campaignId, placementId: params.placementId, bid: params.bid },
      'Revcontent: Enabling/reactivating widget'
    )

    // TODO: Implement actual Revcontent API call to remove from blocklist
    logger.warn(
      { placementId: params.placementId },
      'Revcontent: enablePlacement not yet implemented - requires removeFromBlocklist API'
    )

    return {
      success: false,
      placementId: params.placementId,
      error: 'Enable placement not yet implemented for Revcontent',
    }
  }

  getConstraints(): SourceConstraints {
    return {
      // Revcontent has no documented limit on blocked widgets
      maxBlocksPerCampaign: null,
      // No specific minimum threshold
      minBlockThreshold: 20,
      // Revcontent reporting delay is unknown, assume minimal
      reportingDelayHours: 0,
      // Revcontent rate limit: 100 requests per minute
      rateLimit: { requestsPerMinute: 100 },
      // Revcontent supports per-widget bid adjustments
      supportsDirectBidAdjust: true,
      // Revcontent uses "widgets" (campaigns are "Boosts")
      placementTerminology: 'widget',
    }
  }
}
