/**
 * MGID Optimizer Adapter
 *
 * Wraps MgidSource with optimizer-specific functionality:
 * - Widgets terminology (native to MGID)
 * - No campaign-level bid adjustments (teaser-level only)
 * - Unlimited widget blocking
 * - Quality factor support in metadata
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
import type { MgidSource } from '../../../traffic-sources/mgid/index.js'
import { logger } from '../../../lib/logger.js'

export class MGIDOptimizerAdapter implements OptimizerAdapter {
  readonly sourceId = 'mgid'

  constructor(private source: MgidSource) {}

  async getPlacementsWithMetrics(params: GetPlacementsParams): Promise<PlacementMetrics[]> {
    logger.debug({ campaignId: params.campaignId, from: params.from, to: params.to }, 'MGID: Fetching placements')

    // MGID natively uses "widgets"
    const widgets = await this.source.getWidgets({ campaignId: params.campaignId })

    return widgets.map((widget) => ({
      ...normalizeWidgetToPlacement(widget),
      // MGID may provide quality factor in metadata
      metadata: { domain: widget.domain },
    }))
  }

  async blockPlacement(params: BlockPlacementParams): Promise<BlockResult> {
    logger.info(
      { campaignId: params.campaignId, placementId: params.placementId, reason: params.reason },
      'MGID: Blocking widget'
    )

    try {
      const result = await this.source.blacklistWidget(params.campaignId, params.placementId)

      if (result.success) {
        logger.info({ placementId: params.placementId }, 'MGID: Widget blocked successfully')
      } else {
        logger.warn({ placementId: params.placementId, error: result.error }, 'MGID: Failed to block widget')
      }

      return {
        success: result.success,
        placementId: params.placementId,
        error: result.error,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      logger.error({ placementId: params.placementId, error }, 'MGID: Error blocking widget')
      return {
        success: false,
        placementId: params.placementId,
        error,
      }
    }
  }

  async adjustPlacementBid(params: AdjustBidParams): Promise<BidResult> {
    // MGID does NOT support campaign-level bid adjustments
    // Bids can only be adjusted at teaser (ad) level, not widget level
    logger.warn(
      { campaignId: params.campaignId, placementId: params.placementId },
      'MGID: Bid adjustment not supported at widget level (teaser-level only)'
    )

    return {
      success: false,
      placementId: params.placementId,
      previousBid: params.previousBid || 0,
      newBid: params.newBid,
      error: 'MGID does not support widget-level bid adjustments. Bids can only be adjusted at teaser level.',
    }
  }

  async enablePlacement(params: EnablePlacementParams): Promise<EnableResult> {
    logger.info(
      { campaignId: params.campaignId, placementId: params.placementId, bid: params.bid },
      'MGID: Enabling/reactivating widget'
    )

    // TODO: Implement actual MGID API call to remove from blocklist
    logger.warn(
      { placementId: params.placementId },
      'MGID: enablePlacement not yet implemented - requires removeFromBlocklist API'
    )

    return {
      success: false,
      placementId: params.placementId,
      error: 'Enable placement not yet implemented for MGID',
    }
  }

  getConstraints(): SourceConstraints {
    return {
      // MGID has no documented limit on blocked widgets
      maxBlocksPerCampaign: null,
      // No specific minimum threshold
      minBlockThreshold: 20,
      // MGID reporting delay is unknown, assume 1 hour
      reportingDelayHours: 1,
      // MGID rate limit: 100 requests per minute
      rateLimit: { requestsPerMinute: 100 },
      // MGID does NOT support campaign-level bid adjustments (teaser-level only)
      supportsDirectBidAdjust: false,
      // MGID natively uses "widgets"
      placementTerminology: 'widget',
    }
  }
}
