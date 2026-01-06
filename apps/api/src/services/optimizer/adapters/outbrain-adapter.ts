/**
 * Outbrain Optimizer Adapter
 *
 * Wraps OutbrainSource with optimizer-specific functionality:
 * - Publishers/Sections terminology (called "publishers" in Outbrain)
 * - Max 30 publishers blocked per campaign
 * - 2-4 hour reporting delay
 * - Recommends 400+ clicks before blocking
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
import type { OutbrainSource } from '../../../traffic-sources/outbrain/index.js'
import { logger } from '../../../lib/logger.js'

export class OutbrainOptimizerAdapter implements OptimizerAdapter {
  readonly sourceId = 'outbrain'

  constructor(private source: OutbrainSource) {}

  async getPlacementsWithMetrics(params: GetPlacementsParams): Promise<PlacementMetrics[]> {
    logger.debug({ campaignId: params.campaignId, from: params.from, to: params.to }, 'Outbrain: Fetching placements')

    // Outbrain calls placements "publishers"
    const widgets = await this.source.getWidgets({ campaignId: params.campaignId })

    return widgets.map((widget) => normalizeWidgetToPlacement(widget))
  }

  async blockPlacement(params: BlockPlacementParams): Promise<BlockResult> {
    logger.info(
      { campaignId: params.campaignId, placementId: params.placementId, reason: params.reason },
      'Outbrain: Blocking publisher'
    )

    try {
      const result = await this.source.blacklistWidget(params.campaignId, params.placementId)

      if (result.success) {
        logger.info({ placementId: params.placementId }, 'Outbrain: Publisher blocked successfully')
      } else {
        logger.warn({ placementId: params.placementId, error: result.error }, 'Outbrain: Failed to block publisher')
      }

      return {
        success: result.success,
        placementId: params.placementId,
        error: result.error,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      logger.error({ placementId: params.placementId, error }, 'Outbrain: Error blocking publisher')
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
      'Outbrain: Adjusting publisher bid'
    )

    try {
      const result = await this.source.adjustWidgetBid(params.campaignId, params.placementId, params.newBid)

      if (result.success) {
        logger.info(
          { placementId: params.placementId, previousBid: result.previousBid, newBid: result.newBid },
          'Outbrain: Bid adjusted successfully'
        )
      } else {
        logger.warn({ placementId: params.placementId, error: result.error }, 'Outbrain: Failed to adjust bid')
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
      logger.error({ placementId: params.placementId, error }, 'Outbrain: Error adjusting bid')
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
      'Outbrain: Enabling/reactivating publisher'
    )

    // TODO: Implement actual Outbrain API call to remove from blocklist
    // For now, log and return error since API method isn't implemented
    logger.warn(
      { placementId: params.placementId },
      'Outbrain: enablePlacement not yet implemented - requires removeFromBlocklist API'
    )

    return {
      success: false,
      placementId: params.placementId,
      error: 'Enable placement not yet implemented for Outbrain',
    }
  }

  getConstraints(): SourceConstraints {
    return {
      // Outbrain allows max 30 publishers blocked per campaign
      maxBlocksPerCampaign: 30,
      // Outbrain recommends 400+ clicks before making blocking decisions
      minBlockThreshold: 400,
      // Outbrain has 2-4 hour reporting delay
      reportingDelayHours: 4,
      // Outbrain rate limit: 30 requests per second
      rateLimit: { requestsPerSecond: 30 },
      // Outbrain supports per-publisher bid modifiers
      supportsDirectBidAdjust: true,
      // Outbrain calls them "publishers"
      placementTerminology: 'publisher',
    }
  }
}
