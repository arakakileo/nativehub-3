/**
 * Optimizer Adapter Interface
 *
 * Wraps traffic sources with optimizer-specific functionality:
 * - Source constraints (block limits, rate limits)
 * - Normalized placement metrics
 * - Reporting delay awareness
 */

import type { CampaignMetrics } from '@nativehub/shared'

/**
 * Normalized placement metrics for optimizer evaluation
 * Unified structure across all traffic sources
 */
export interface PlacementMetrics {
  id: string // External placement ID
  name: string // Human-readable name
  spend: number
  impressions: number
  clicks: number
  conversions: number
  cpc: number // Calculated: spend / clicks
  cpa: number // Calculated: spend / conversions (0 if no conversions)
  ctr: number // Calculated: clicks / impressions * 100
  // Source-specific metadata (quality factor for MGID, etc.)
  metadata?: Record<string, unknown>
}

/**
 * Result from block operation
 */
export interface BlockResult {
  success: boolean
  placementId: string
  error?: string
}

/**
 * Result from bid adjustment operation
 */
export interface BidResult {
  success: boolean
  placementId: string
  previousBid: number
  newBid: number
  error?: string
}

/**
 * Source-specific constraints that affect optimization behavior
 */
export interface SourceConstraints {
  /** Maximum placements that can be blocked per campaign (null = unlimited) */
  maxBlocksPerCampaign: number | null
  /** Minimum clicks before a placement should be considered for blocking */
  minBlockThreshold: number
  /** Hours of delay in reporting data (e.g., Outbrain has 2-4h delay) */
  reportingDelayHours: number
  /** Rate limit configuration */
  rateLimit: {
    requestsPerSecond?: number
    requestsPerMinute?: number
  }
  /** Whether source supports direct bid adjustments at placement level */
  supportsDirectBidAdjust: boolean
  /** Source-specific terminology for UI display */
  placementTerminology: 'publisher' | 'site' | 'widget'
}

/**
 * Parameters for fetching placements with metrics
 */
export interface GetPlacementsParams {
  campaignId: string
  from: string // YYYY-MM-DD format
  to: string // YYYY-MM-DD format
}

/**
 * Parameters for blocking a placement
 */
export interface BlockPlacementParams {
  campaignId: string
  placementId: string
  reason: string
}

/**
 * Parameters for adjusting placement bid
 */
export interface AdjustBidParams {
  campaignId: string
  placementId: string
  newBid: number
  previousBid?: number
}

/**
 * Parameters for enabling/reactivating a placement
 */
export interface EnablePlacementParams {
  campaignId: string
  placementId: string
  bid?: number // Optional new bid on reactivation
}

/**
 * Result from enable operation
 */
export interface EnableResult {
  success: boolean
  placementId: string
  error?: string
}

/**
 * Optimizer Adapter Interface
 *
 * Each traffic source implements this to provide:
 * - Normalized placement data
 * - Source-specific constraint handling
 * - Block/bid operations with error handling
 */
export interface OptimizerAdapter {
  /** Source identifier (outbrain, taboola, mgid, revcontent) */
  readonly sourceId: string

  /**
   * Fetch all placements with their metrics for a campaign
   * Returns normalized data regardless of source terminology
   */
  getPlacementsWithMetrics(params: GetPlacementsParams): Promise<PlacementMetrics[]>

  /**
   * Block a placement (publisher/site/widget depending on source)
   * Respects source-specific block limits
   */
  blockPlacement(params: BlockPlacementParams): Promise<BlockResult>

  /**
   * Adjust bid for a placement
   * Some sources may not support this (returns error)
   */
  adjustPlacementBid(params: AdjustBidParams): Promise<BidResult>

  /**
   * Enable/reactivate a previously paused or blocked placement
   * Used for widget reactivation after cooldown period
   * Some sources may not support this (returns error)
   */
  enablePlacement(params: EnablePlacementParams): Promise<EnableResult>

  /**
   * Get source-specific constraints
   * Used by rule engine and action executor
   */
  getConstraints(): SourceConstraints
}

/**
 * Helper function to calculate CPA safely
 */
export function calculateCpa(spend: number, conversions: number): number {
  return conversions > 0 ? spend / conversions : 0
}

/**
 * Helper function to calculate CPC safely
 */
export function calculateCpc(spend: number, clicks: number): number {
  return clicks > 0 ? spend / clicks : 0
}

/**
 * Helper function to calculate CTR safely
 */
export function calculateCtr(clicks: number, impressions: number): number {
  return impressions > 0 ? (clicks / impressions) * 100 : 0
}

/**
 * Raw widget data from traffic source
 */
export interface RawWidgetData {
  externalId: string
  name?: string
  domain?: string
  enabled?: boolean
  metrics?: {
    spend?: number
    impressions?: number
    clicks?: number
    conversions?: number
  }
}

/**
 * Normalize raw widget data to PlacementMetrics
 * Shared helper to reduce duplication across adapters
 * Uses nullish coalescing (??) to properly handle explicit 0 values
 */
export function normalizeWidgetToPlacement(widget: RawWidgetData): PlacementMetrics {
  const metrics = widget.metrics ?? {}
  const spend = metrics.spend ?? 0
  const impressions = metrics.impressions ?? 0
  const clicks = metrics.clicks ?? 0
  const conversions = metrics.conversions ?? 0

  return {
    id: widget.externalId,
    name: widget.name ?? widget.domain ?? widget.externalId,
    spend,
    impressions,
    clicks,
    conversions,
    cpc: calculateCpc(spend, clicks),
    cpa: calculateCpa(spend, conversions),
    ctr: calculateCtr(clicks, impressions),
  }
}
