import type { NormalizedCampaign, NormalizedWidget, CampaignMetrics } from '@nativehub/shared'
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
import { makeRequest, buildUrl } from '../utils/request-helpers.js'
import { withRetry } from '../utils/retry.js'
import { getRateLimiter } from '../utils/rate-limiter.js'
import { logger } from '../../lib/logger.js'

const config = TRAFFIC_SOURCE_CONFIG.revcontent

/**
 * Revcontent Traffic Source Implementation
 */
export class RevcontentSource extends BaseTrafficSource {
  readonly sourceId = 'revcontent'

  private rateLimiter = getRateLimiter('revcontent', config.rateLimit)
  private clientId: string = ''
  private clientSecret: string = ''

  async authenticate(credentials: TrafficSourceCredentials): Promise<AuthResult> {
    if (!credentials.clientId || !credentials.clientSecret) {
      throw new Error('Revcontent requires clientId and clientSecret')
    }

    this.clientId = credentials.clientId
    this.clientSecret = credentials.clientSecret

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      logger.info({ sourceId: this.sourceId }, 'Authenticating with Revcontent')

      const response = await makeRequest<{
        access_token: string
        expires_in: number
        token_type: string
      }>(buildUrl(config.baseUrl, '/token'), {
        method: 'POST',
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      })

      this.accessToken = response.access_token
      this.tokenExpiresAt = Date.now() + response.expires_in * 1000

      logger.info({ sourceId: this.sourceId }, 'Authentication successful')

      return {
        accessToken: response.access_token,
        expiresIn: response.expires_in,
      }
    })
  }

  async refreshAuth(): Promise<AuthResult> {
    // Revcontent uses client credentials, just re-authenticate
    return this.authenticate({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    })
  }

  async getCampaigns(options: ListCampaignsOptions = {}): Promise<NormalizedCampaign[]> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      const response = await makeRequest<RevcontentCampaign[]>(
        buildUrl(config.baseUrl, '/boosts', {
          page: options.page,
          per_page: options.perPage || 100,
        }),
        { accessToken: this.accessToken! }
      )

      // Fetch statistics for each campaign in parallel (with rate limiting)
      const campaignsWithStats = await Promise.all(
        response.map(async (campaign) => {
          try {
            const stats = await this.getCampaignStatistics(String(campaign.id), options.from, options.to)
            return this.normalizeCampaign(campaign, stats)
          } catch (error) {
            logger.warn({ campaignId: campaign.id, error }, 'Failed to fetch Revcontent campaign stats')
            return this.normalizeCampaign(campaign)
          }
        })
      )

      return campaignsWithStats
    })
  }

  /**
   * Fetch campaign performance statistics from Revcontent
   * Uses stats/boosts endpoint
   */
  async getCampaignStatistics(campaignId: string, from?: string, to?: string): Promise<CampaignStats> {
    await this.ensureAuthenticated()
    await this.rateLimiter.acquire()

    // Default to last 30 days if no date range provided
    const toDate = to || new Date().toISOString().split('T')[0]
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const url = buildUrl(config.baseUrl, '/stats/boosts', {
      boost_id: campaignId,
      date_from: fromDate,
      date_to: toDate,
    })

    logger.debug({ url, campaignId, from: fromDate, to: toDate }, 'Revcontent getCampaignStatistics request')

    try {
      const response = await makeRequest<RevcontentStatsResponse>(
        url,
        { accessToken: this.accessToken! }
      )

      // Extract stats from response
      const data = response.data || response
      return {
        spend: data.spend || 0,
        impressions: data.impressions || 0,
        clicks: data.clicks || 0,
        conversions: data.conversions || 0,
      }
    } catch (error) {
      logger.warn({ campaignId, error }, 'Failed to fetch Revcontent performance stats, returning zeros')
      return { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
    }
  }

  async getCampaign(campaignId: string): Promise<NormalizedCampaign> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      const response = await makeRequest<RevcontentCampaign>(
        buildUrl(config.baseUrl, `/boosts/${campaignId}`),
        { accessToken: this.accessToken! }
      )

      return this.normalizeCampaign(response)
    })
  }

  async toggleCampaign(campaignId: string): Promise<{ enabled: boolean }> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      // Get current state
      const campaign = await this.getCampaign(campaignId)
      const newEnabled = !campaign.enabled

      await makeRequest(
        buildUrl(config.baseUrl, `/boosts/${campaignId}`),
        {
          method: 'PUT',
          accessToken: this.accessToken!,
          body: JSON.stringify({ enabled: newEnabled }),
        }
      )

      return { enabled: newEnabled }
    })
  }

  async getWidgets(options: ListWidgetsOptions): Promise<NormalizedWidget[]> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      const response = await makeRequest<RevcontentWidget[]>(
        buildUrl(config.baseUrl, `/boosts/${options.campaignId}/widgets`, {
          page: options.page,
          per_page: options.perPage || 100,
        }),
        { accessToken: this.accessToken! }
      )

      return response.map((w) => this.normalizeWidget(w, options.campaignId))
    })
  }

  async blacklistWidget(campaignId: string, widgetId: string): Promise<BlacklistResult> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      try {
        await makeRequest(
          buildUrl(config.baseUrl, `/boosts/${campaignId}/widgets/${widgetId}/block`),
          {
            method: 'POST',
            accessToken: this.accessToken!,
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

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      try {
        // Get current bid
        const widgets = await this.getWidgets({ campaignId })
        const widget = widgets.find((w) => w.externalId === widgetId)
        const previousBid = widget?.metrics?.cpc || 0

        await makeRequest(
          buildUrl(config.baseUrl, `/boosts/${campaignId}/widgets/${widgetId}`),
          {
            method: 'PUT',
            accessToken: this.accessToken!,
            body: JSON.stringify({ bid: newBid }),
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
    if (!this.isAuthenticated() || this.isTokenExpiringSoon(config.tokenRefreshBuffer)) {
      if (this.clientId && this.clientSecret) {
        await this.refreshAuth()
      } else {
        throw new Error('Not authenticated')
      }
    }
  }

  private normalizeCampaign(campaign: RevcontentCampaign, stats?: CampaignStats): NormalizedCampaign {
    // Use fetched stats if available, otherwise fall back to campaign-level data
    const metricsSource = stats || campaign
    return {
      id: `revcontent-${campaign.id}`,
      externalId: String(campaign.id),
      sourceId: 'revcontent',
      sourceAccountId: '', // Set by caller
      name: campaign.name,
      status: this.mapStatus(campaign.status),
      enabled: campaign.enabled,
      budget: campaign.budget || 'unlimited',
      bid: campaign.bid,
      metrics: this.extractMetrics(metricsSource),
      createdAt: campaign.created_at,
      updatedAt: campaign.updated_at || campaign.created_at,
    }
  }

  private normalizeWidget(widget: RevcontentWidget, campaignId: string): NormalizedWidget {
    return {
      id: `revcontent-${widget.id}`,
      externalId: String(widget.id),
      campaignId,
      name: widget.name || widget.domain || `Widget ${widget.id}`,
      domain: widget.domain,
      enabled: widget.enabled,
      metrics: this.extractMetrics(widget),
    }
  }

  private mapStatus(status: string): 'active' | 'paused' | 'deleted' | 'pending' {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'running':
        return 'active'
      case 'paused':
      case 'stopped':
        return 'paused'
      case 'deleted':
        return 'deleted'
      default:
        return 'pending'
    }
  }

  private extractMetrics(data: { spend?: number; impressions?: number; clicks?: number; conversions?: number }): CampaignMetrics {
    const spend = data.spend || 0
    const impressions = data.impressions || 0
    const clicks = data.clicks || 0
    const conversions = data.conversions || 0

    return {
      spend,
      impressions,
      clicks,
      conversions,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpa: conversions > 0 ? spend / conversions : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
    }
  }
}

// Revcontent API types
interface RevcontentCampaign {
  id: number
  name: string
  status: string
  enabled: boolean
  budget?: number
  bid: number
  spend?: number
  impressions?: number
  clicks?: number
  conversions?: number
  created_at: string
  updated_at?: string
}

interface RevcontentWidget {
  id: number
  name?: string
  domain?: string
  enabled: boolean
  spend?: number
  impressions?: number
  clicks?: number
  conversions?: number
}

interface RevcontentStatsResponse {
  data?: {
    spend?: number
    impressions?: number
    clicks?: number
    conversions?: number
  }
  spend?: number
  impressions?: number
  clicks?: number
  conversions?: number
}
