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

const config = TRAFFIC_SOURCE_CONFIG.mgid

/**
 * MGID Traffic Source Implementation
 * Auth: API key header (X-API-KEY)
 */
export class MgidSource extends BaseTrafficSource {
  readonly sourceId = 'mgid'

  private rateLimiter = getRateLimiter('mgid', config.rateLimit)
  private apiKey: string = ''
  private clientId: string = ''

  async authenticate(credentials: TrafficSourceCredentials): Promise<AuthResult> {
    if (!credentials.clientId) {
      throw new Error('MGID requires clientId (API key)')
    }

    this.apiKey = credentials.clientId
    // clientSecret can be used to pass client ID
    this.clientId = credentials.clientSecret || ''

    // MGID uses API key, no token exchange needed
    this.accessToken = this.apiKey
    // API key doesn't expire, but we set a long expiry
    this.tokenExpiresAt = Date.now() + (365 * 24 * 60 * 60 * 1000) // 1 year

    logger.info({ sourceId: this.sourceId }, 'MGID API key configured')

    return {
      accessToken: this.apiKey,
      expiresIn: 365 * 24 * 60 * 60, // 1 year in seconds
    }
  }

  async refreshAuth(): Promise<AuthResult> {
    // API key doesn't need refresh
    return this.authenticate({
      clientId: this.apiKey,
      clientSecret: this.clientId,
    })
  }

  async getCampaigns(options: ListCampaignsOptions = {}): Promise<NormalizedCampaign[]> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      const response = await makeRequest<{ campaigns: MgidCampaign[] }>(
        buildUrl(config.baseUrl, `/clients/${this.clientId}/campaigns`, {
          page: options.page || 1,
          limit: options.perPage || 100,
        }),
        {
          headers: {
            'X-API-KEY': this.accessToken!,
          },
        }
      )

      // Fetch statistics for each campaign in parallel (with rate limiting)
      const campaignsWithStats = await Promise.all(
        response.campaigns.map(async (campaign) => {
          try {
            const stats = await this.getCampaignStatistics(String(campaign.id), options.from, options.to)
            return this.normalizeCampaign(campaign, stats)
          } catch (error) {
            logger.warn({ campaignId: campaign.id, error }, 'Failed to fetch MGID campaign stats')
            return this.normalizeCampaign(campaign)
          }
        })
      )

      return campaignsWithStats
    })
  }

  /**
   * Fetch campaign performance statistics from MGID
   * Uses campaign stats endpoint
   */
  async getCampaignStatistics(campaignId: string, from?: string, to?: string): Promise<CampaignStats> {
    await this.ensureAuthenticated()
    await this.rateLimiter.acquire()

    // Default to last 30 days if no date range provided
    const toDate = to || new Date().toISOString().split('T')[0]
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const url = buildUrl(config.baseUrl, `/clients/${this.clientId}/campaigns/${campaignId}/stats`, {
      date_from: fromDate,
      date_to: toDate,
    })

    logger.debug({ url, campaignId, from: fromDate, to: toDate }, 'MGID getCampaignStatistics request')

    try {
      const response = await makeRequest<MgidStatsResponse>(
        url,
        {
          headers: {
            'X-API-KEY': this.accessToken!,
          },
        }
      )

      // Extract stats - MGID uses 'cost' for spend
      const data = response.data || response
      return {
        spend: data.cost || data.spend || data.spent || 0,
        impressions: data.impressions || data.imps || 0,
        clicks: data.clicks || 0,
        conversions: data.conversions || 0,
      }
    } catch (error) {
      logger.warn({ campaignId, error }, 'Failed to fetch MGID performance stats, returning zeros')
      return { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
    }
  }

  async getCampaign(campaignId: string): Promise<NormalizedCampaign> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      const response = await makeRequest<MgidCampaign>(
        buildUrl(config.baseUrl, `/clients/${this.clientId}/campaigns/${campaignId}`),
        {
          headers: {
            'X-API-KEY': this.accessToken!,
          },
        }
      )

      return this.normalizeCampaign(response)
    })
  }

  async toggleCampaign(campaignId: string): Promise<{ enabled: boolean }> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      const campaign = await this.getCampaign(campaignId)
      const newEnabled = !campaign.enabled
      const newStatus = newEnabled ? 'active' : 'paused'

      await makeRequest(
        buildUrl(config.baseUrl, `/clients/${this.clientId}/campaigns/${campaignId}`),
        {
          method: 'PATCH',
          headers: {
            'X-API-KEY': this.accessToken!,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      )

      return { enabled: newEnabled }
    })
  }

  async getWidgets(options: ListWidgetsOptions): Promise<NormalizedWidget[]> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      const response = await makeRequest<{ widgets: MgidWidget[] }>(
        buildUrl(config.baseUrl, `/clients/${this.clientId}/campaigns/${options.campaignId}/widgets`, {
          page: options.page || 1,
          limit: options.perPage || 100,
        }),
        {
          headers: {
            'X-API-KEY': this.accessToken!,
          },
        }
      )

      return response.widgets.map((w) => this.normalizeWidget(w, options.campaignId))
    })
  }

  async blacklistWidget(campaignId: string, widgetId: string): Promise<BlacklistResult> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      try {
        await makeRequest(
          buildUrl(config.baseUrl, `/clients/${this.clientId}/campaigns/${campaignId}/widgets/${widgetId}/block`),
          {
            method: 'POST',
            headers: {
              'X-API-KEY': this.accessToken!,
            },
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
        const widgets = await this.getWidgets({ campaignId })
        const widget = widgets.find((w) => w.externalId === widgetId)
        const previousBid = widget?.metrics?.cpc || 0

        await makeRequest(
          buildUrl(config.baseUrl, `/clients/${this.clientId}/campaigns/${campaignId}/widgets/${widgetId}`),
          {
            method: 'PATCH',
            headers: {
              'X-API-KEY': this.accessToken!,
            },
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
    if (!this.isAuthenticated()) {
      if (this.apiKey) {
        await this.refreshAuth()
      } else {
        throw new Error('Not authenticated')
      }
    }
  }

  private normalizeCampaign(campaign: MgidCampaign, stats?: CampaignStats): NormalizedCampaign {
    // Use fetched stats if available, otherwise fall back to campaign-level data
    const metricsSource = stats || campaign
    return {
      id: `mgid-${campaign.id}`,
      externalId: String(campaign.id),
      sourceId: 'mgid',
      sourceAccountId: '',
      name: campaign.name,
      status: this.mapStatus(campaign.status),
      enabled: campaign.status === 'active',
      budget: campaign.daily_budget || campaign.total_budget || 'unlimited',
      bid: campaign.cpc || 0,
      metrics: extractMetrics(metricsSource),
      createdAt: campaign.created_at || new Date().toISOString(),
      updatedAt: campaign.updated_at || campaign.created_at || new Date().toISOString(),
    }
  }

  private normalizeWidget(widget: MgidWidget, campaignId: string): NormalizedWidget {
    return {
      id: `mgid-${widget.id}`,
      externalId: String(widget.id),
      campaignId,
      name: widget.name || widget.domain || `Widget ${widget.id}`,
      domain: widget.domain,
      enabled: !widget.blocked,
      metrics: extractMetrics(widget),
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
      case 'archived':
        return 'deleted'
      default:
        return 'pending'
    }
  }
}

// MGID API types
interface MgidCampaign {
  id: number
  name: string
  status: string
  daily_budget?: number
  total_budget?: number
  cpc?: number
  spent?: number
  spend?: number
  impressions?: number
  clicks?: number
  conversions?: number
  created_at?: string
  updated_at?: string
}

interface MgidWidget {
  id: number
  name?: string
  domain?: string
  blocked?: boolean
  spent?: number
  spend?: number
  impressions?: number
  clicks?: number
  conversions?: number
  cpc?: number
}

interface MgidStatsResponse {
  data?: {
    cost?: number
    spend?: number
    spent?: number
    impressions?: number
    imps?: number
    clicks?: number
    conversions?: number
  }
  cost?: number
  spend?: number
  spent?: number
  impressions?: number
  imps?: number
  clicks?: number
  conversions?: number
}
