import type { NormalizedCampaign, NormalizedWidget } from '@nativehub/shared'
import {
  BaseTrafficSource,
  type TrafficSourceCredentials,
  type AuthResult,
  type ListCampaignsOptions,
  type ListWidgetsOptions,
  type BlacklistResult,
  type BidAdjustmentResult,
  type CampaignStats,
} from '../interface.js'
import { TRAFFIC_SOURCE_CONFIG } from '../config.js'
import { makeRequest, buildUrl, extractMetrics } from '../utils/request-helpers.js'
import { withRetry } from '../utils/retry.js'
import { getRateLimiter } from '../utils/rate-limiter.js'
import { logger } from '../../lib/logger.js'

const config = TRAFFIC_SOURCE_CONFIG.outbrain

/**
 * Outbrain Traffic Source Implementation
 * Auth: Basic auth (username/password) with token response
 * Note: Strict rate limiting - 30 req/s, login limited to 2 req/hour
 */
export class OutbrainSource extends BaseTrafficSource {
  readonly sourceId = 'outbrain'

  private rateLimiter = getRateLimiter('outbrain', config.rateLimit)
  private username: string = ''
  private password: string = ''
  private marketerId: string = ''

  // Override to also set marketerId when restoring from cached token
  override setStoredToken(token: string, expiresAt: Date, externalAccountId?: string): void {
    super.setStoredToken(token, expiresAt, externalAccountId)
    this.marketerId = externalAccountId || ''
    if (!this.marketerId) {
      logger.warn({ sourceId: this.sourceId }, 'Outbrain token restored without marketerId - API calls will fail')
    }
    logger.debug({ sourceId: this.sourceId, marketerId: this.marketerId }, 'Restored Outbrain token with marketerId')
  }

  /**
   * Validate that marketerId is set before making API calls
   * @throws Error if marketerId is empty
   */
  private validateMarketerId(): void {
    if (!this.marketerId || this.marketerId.trim() === '') {
      throw new Error('Outbrain marketerId is not set. Please provide accountId (marketer ID) in credentials.')
    }
  }

  async authenticate(credentials: TrafficSourceCredentials): Promise<AuthResult> {
    // Support pre-obtained OB_TOKEN_V1 (clientId contains token, accountId contains marketer ID)
    if (credentials.clientId && credentials.clientId.length > 100) {
      // This looks like a pre-obtained OB_TOKEN_V1 (they're typically 500+ chars)
      this.accessToken = credentials.clientId
      this.marketerId = credentials.accountId || ''
      // Assume token is valid for 30 days from now
      this.tokenExpiresAt = Date.now() + (config.tokenValidityDays * 24 * 60 * 60 * 1000)

      logger.info({ sourceId: this.sourceId, marketerId: this.marketerId }, 'Using pre-obtained Outbrain token')

      return {
        accessToken: this.accessToken,
        expiresIn: config.tokenValidityDays * 24 * 60 * 60,
      }
    }

    // Traditional username/password auth
    if (!credentials.username || !credentials.password) {
      throw new Error('Outbrain requires username and password, or a pre-obtained OB_TOKEN_V1')
    }

    this.username = credentials.username
    this.password = credentials.password
    this.marketerId = credentials.accountId || ''

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      logger.info({ sourceId: this.sourceId }, 'Authenticating with Outbrain')

      // Outbrain uses Basic auth to get a token
      const authHeader = Buffer.from(`${this.username}:${this.password}`).toString('base64')

      const response = await makeRequest<{
        OB_TOKEN_V1: string
      }>(buildUrl(config.baseUrl, '/login'), {
        method: 'GET',
        headers: {
          Authorization: `Basic ${authHeader}`,
        },
      })

      this.accessToken = response.OB_TOKEN_V1
      // Outbrain tokens are valid for 30 days
      this.tokenExpiresAt = Date.now() + (config.tokenValidityDays * 24 * 60 * 60 * 1000)

      logger.info({ sourceId: this.sourceId }, 'Authentication successful')

      return {
        accessToken: response.OB_TOKEN_V1,
        expiresIn: config.tokenValidityDays * 24 * 60 * 60,
      }
    })
  }

  async refreshAuth(): Promise<AuthResult> {
    // If we have username/password, use traditional auth refresh
    if (this.username && this.password) {
      return this.authenticate({
        username: this.username,
        password: this.password,
        accountId: this.marketerId,
      })
    }
    // For pre-obtained tokens, just return current state (can't refresh without credentials)
    return {
      accessToken: this.accessToken || '',
      expiresIn: config.tokenValidityDays * 24 * 60 * 60,
    }
  }

  async getCampaigns(options: ListCampaignsOptions = {}): Promise<NormalizedCampaign[]> {
    await this.ensureAuthenticated()
    this.validateMarketerId()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      // Outbrain API limits to 50 items per page
      const limit = Math.min(options.perPage || 50, 50)
      const url = buildUrl(config.baseUrl, `/marketers/${this.marketerId}/campaigns`, {
        offset: options.page ? (options.page - 1) * limit : 0,
        limit,
      })

      logger.info({ url, marketerId: this.marketerId }, 'Outbrain getCampaigns request')

      const response = await makeRequest<{ campaigns: OutbrainCampaign[] }>(
        url,
        {
          headers: {
            'OB-TOKEN-V1': this.accessToken!,
          },
        }
      )

      logger.info({ campaignCount: response.campaigns.length }, 'Outbrain campaigns fetched')

      // Fetch ALL campaign stats in ONE call using periodic endpoint (more reliable)
      const statsMap = await this.getAllCampaignStatistics(options.from, options.to)

      // Normalize campaigns with stats from the map
      const campaignsWithStats = response.campaigns.map((campaign) => {
        const stats = statsMap.get(campaign.id)
        if (!stats) {
          logger.debug({ campaignId: campaign.id, campaignName: campaign.name }, 'No stats found for campaign')
        }
        return this.normalizeCampaign(campaign, stats)
      })

      const withStats = campaignsWithStats.filter((c) => c.metrics.spend > 0 || c.metrics.impressions > 0).length
      logger.info({
        totalCampaigns: response.campaigns.length,
        withStats,
        statsMapSize: statsMap.size
      }, 'Outbrain campaigns normalized with stats')

      return campaignsWithStats
    })
  }

  /**
   * Fetch ALL campaign performance statistics from Outbrain in ONE call
   * Uses the periodic campaigns endpoint which is more reliable than performanceByContent
   * Returns a Map of campaignId -> CampaignStats
   */
  private async getAllCampaignStatistics(from?: string, to?: string): Promise<Map<string, CampaignStats>> {
    await this.rateLimiter.acquire()

    // Default to last 30 days if no date range provided
    const toDate = to || new Date().toISOString().split('T')[0]
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Use the periodic campaigns endpoint - ONE call for ALL campaigns
    const url = buildUrl(config.baseUrl, `/reports/marketers/${this.marketerId}/campaigns/periodic`, {
      from: fromDate,
      to: toDate,
      breakdown: 'daily', // Get daily breakdown which aggregates per campaign
      sort: '-spend', // Sort by spend descending (includes direction char to avoid 500 errors)
      limit: 500, // Max allowed by Outbrain API
    })

    logger.info({ url, from: fromDate, to: toDate }, 'Outbrain getAllCampaignStatistics request')

    const statsMap = new Map<string, CampaignStats>()

    try {
      const response = await makeRequest<{ results: OutbrainPeriodicResult[] }>(
        url,
        {
          headers: {
            'OB-TOKEN-V1': this.accessToken!,
          },
        }
      )

      logger.info({ resultsCount: response.results?.length || 0 }, 'Outbrain periodic stats received')

      // Aggregate results by campaign ID (results may have multiple entries per campaign for daily breakdown)
      for (const result of response.results || []) {
        const campaignId = result.campaignId
        if (!campaignId) continue

        const existing = statsMap.get(campaignId) || { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
        statsMap.set(campaignId, {
          spend: existing.spend + (result.spend || 0),
          impressions: existing.impressions + (result.impressions || 0),
          clicks: existing.clicks + (result.clicks || 0),
          conversions: existing.conversions + (result.conversions || 0),
        })
      }

      logger.info({ campaignsWithStats: statsMap.size }, 'Outbrain stats aggregated by campaign')
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to fetch Outbrain periodic stats')
      // Return empty map - campaigns will show 0 metrics
    }

    return statsMap
  }

  /**
   * Fetch campaign performance statistics from Outbrain for a single campaign
   * Fallback method - prefer getAllCampaignStatistics for batch fetching
   * @throws Error if API call fails (don't silently return zeros)
   */
  async getCampaignStatistics(campaignId: string, from?: string, to?: string): Promise<CampaignStats> {
    await this.ensureAuthenticated()
    this.validateMarketerId()

    const statsMap = await this.getAllCampaignStatistics(from, to)
    return statsMap.get(campaignId) || { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  }

  async getCampaign(campaignId: string): Promise<NormalizedCampaign> {
    await this.ensureAuthenticated()
    this.validateMarketerId()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      const response = await makeRequest<OutbrainCampaign>(
        buildUrl(config.baseUrl, `/marketers/${this.marketerId}/campaigns/${campaignId}`),
        {
          headers: {
            'OB-TOKEN-V1': this.accessToken!,
          },
        }
      )

      return this.normalizeCampaign(response)
    })
  }

  async toggleCampaign(campaignId: string): Promise<{ enabled: boolean }> {
    await this.ensureAuthenticated()
    this.validateMarketerId()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      const campaign = await this.getCampaign(campaignId)
      const newEnabled = !campaign.enabled

      await makeRequest(
        buildUrl(config.baseUrl, `/marketers/${this.marketerId}/campaigns/${campaignId}`),
        {
          method: 'PUT',
          headers: {
            'OB-TOKEN-V1': this.accessToken!,
          },
          body: JSON.stringify({ enabled: newEnabled }),
        }
      )

      return { enabled: newEnabled }
    })
  }

  async getWidgets(options: ListWidgetsOptions): Promise<NormalizedWidget[]> {
    await this.ensureAuthenticated()
    this.validateMarketerId()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      // Outbrain calls them "publishers" instead of widgets
      // Outbrain API limits to 50 items per page
      const limit = Math.min(options.perPage || 50, 50)
      const response = await makeRequest<{ publishers: OutbrainPublisher[] }>(
        buildUrl(config.baseUrl, `/marketers/${this.marketerId}/campaigns/${options.campaignId}/publishers`, {
          offset: options.page ? (options.page - 1) * limit : 0,
          limit,
        }),
        {
          headers: {
            'OB-TOKEN-V1': this.accessToken!,
          },
        }
      )

      return response.publishers.map((p) => this.normalizeWidget(p, options.campaignId))
    })
  }

  async blacklistWidget(campaignId: string, widgetId: string): Promise<BlacklistResult> {
    await this.ensureAuthenticated()
    this.validateMarketerId()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      try {
        await makeRequest(
          buildUrl(config.baseUrl, `/marketers/${this.marketerId}/campaigns/${campaignId}/publishers/${widgetId}`),
          {
            method: 'PUT',
            headers: {
              'OB-TOKEN-V1': this.accessToken!,
            },
            body: JSON.stringify({ enabled: false }),
          }
        )

        return { success: true, widgetId }
      } catch (error) {
        return {
          success: false,
          widgetId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    })
  }

  async adjustWidgetBid(campaignId: string, widgetId: string, newBid: number): Promise<BidAdjustmentResult> {
    await this.ensureAuthenticated()
    this.validateMarketerId()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      try {
        const widgets = await this.getWidgets({ campaignId })
        const widget = widgets.find((w) => w.externalId === widgetId)
        const previousBid = widget?.metrics?.cpc || 0

        // Outbrain uses bid modification as percentage
        await makeRequest(
          buildUrl(config.baseUrl, `/marketers/${this.marketerId}/campaigns/${campaignId}/publishers/${widgetId}`),
          {
            method: 'PUT',
            headers: {
              'OB-TOKEN-V1': this.accessToken!,
            },
            body: JSON.stringify({ bidModification: newBid }),
          }
        )

        return { success: true, widgetId, previousBid, newBid }
      } catch (error) {
        return {
          success: false,
          widgetId,
          previousBid: 0,
          newBid,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    })
  }

  private async ensureAuthenticated(): Promise<void> {
    // Use a larger buffer for Outbrain due to strict login rate limits
    const refreshBuffer = 24 * 60 * 60 // 1 day buffer
    if (!this.isAuthenticated() || this.isTokenExpiringSoon(refreshBuffer)) {
      if (this.username && this.password) {
        // Traditional auth - can refresh
        await this.refreshAuth()
      } else if (this.accessToken) {
        // Pre-obtained token - assume it's still valid
        logger.debug({ sourceId: this.sourceId }, 'Using pre-obtained token without refresh')
      } else {
        throw new Error('Not authenticated')
      }
    }
  }

  private normalizeCampaign(campaign: OutbrainCampaign, stats?: CampaignStats): NormalizedCampaign {
    // Use fetched stats if available, otherwise fall back to campaign-level data
    const metricsSource = stats || campaign
    return {
      id: `outbrain-${campaign.id}`,
      externalId: campaign.id,
      sourceId: 'outbrain',
      sourceAccountId: '',
      name: campaign.name,
      status: this.mapCampaignStatus(campaign),
      enabled: campaign.enabled,
      budget: campaign.budget?.amount || 'unlimited',
      bid: campaign.cpc || 0,
      metrics: extractMetrics(metricsSource),
      createdAt: campaign.creationTime || new Date().toISOString(),
      updatedAt: campaign.lastModified || campaign.creationTime || new Date().toISOString(),
    }
  }

  private normalizeWidget(publisher: OutbrainPublisher, campaignId: string): NormalizedWidget {
    return {
      id: `outbrain-${publisher.id}`,
      externalId: publisher.id,
      campaignId,
      name: publisher.name || publisher.id,
      domain: publisher.name,
      enabled: publisher.enabled,
      metrics: extractMetrics(publisher),
    }
  }

  /**
   * Map Outbrain campaign status using liveStatus field
   * Outbrain uses liveStatus.campaignOnAir (boolean) and liveStatus.onAirReason (string)
   * instead of a simple status field
   */
  private mapCampaignStatus(campaign: OutbrainCampaign): 'active' | 'paused' | 'deleted' | 'pending' {
    // If campaign is on air, it's active
    if (campaign.liveStatus?.campaignOnAir) {
      return 'active'
    }

    // Check onAirReason for specific statuses
    const reason = campaign.liveStatus?.onAirReason?.toUpperCase()
    if (reason) {
      // Paused/disabled states
      if (reason.includes('DISABLED') || reason.includes('PAUSED') || reason.includes('STOPPED')) {
        return 'paused'
      }
      // Deleted/rejected states
      if (reason.includes('DELETED') || reason.includes('REJECTED')) {
        return 'deleted'
      }
      // Pending approval states
      if (reason.includes('PENDING') || reason.includes('REVIEW') || reason.includes('APPROVAL')) {
        return 'pending'
      }
      // Not currently running due to schedule - but campaign is enabled and will run
      // Treat as active since it's just waiting for scheduled time
      if (reason.includes('NOT_IN_SCHEDULING') || reason.includes('SCHEDULING')) {
        return campaign.enabled ? 'active' : 'paused'
      }
    }

    // If campaign is enabled but not on air (unknown reason), treat as active
    // since the user has enabled it
    if (campaign.enabled) {
      return 'active'
    }

    // If campaign is disabled but no specific reason, treat as paused
    return 'paused'
  }
}

// Outbrain API types
interface OutbrainCampaign {
  id: string
  name: string
  enabled: boolean
  budget?: {
    amount: number
    currency: string
  }
  cpc?: number
  spend?: number
  impressions?: number
  clicks?: number
  conversions?: number
  creationTime?: string
  lastModified?: string
  // Outbrain uses liveStatus instead of status field
  liveStatus?: {
    campaignOnAir: boolean
    onAirReason?: string
    amountSpent?: number
  }
}

interface OutbrainPublisher {
  id: string
  name?: string
  enabled: boolean
  spend?: number
  impressions?: number
  clicks?: number
  conversions?: number
  cpc?: number
}

interface OutbrainPerformanceResult {
  contentId?: string
  spend?: number
  impressions?: number
  clicks?: number
  conversions?: number
}

// Response from /reports/marketers/{marketer}/campaigns/periodic endpoint
interface OutbrainPeriodicResult {
  campaignId?: string
  campaignName?: string
  fromDate?: string
  toDate?: string
  spend?: number
  impressions?: number
  clicks?: number
  conversions?: number
  cpc?: number
  ctr?: number
}
