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

const config = TRAFFIC_SOURCE_CONFIG.taboola

/**
 * Taboola Traffic Source Implementation
 * Auth: OAuth2 client credentials
 */
export class TaboolaSource extends BaseTrafficSource {
  readonly sourceId = 'taboola'

  private rateLimiter = getRateLimiter('taboola', config.rateLimit)
  private clientId: string = ''
  private clientSecret: string = ''
  private accountId: string = ''

  async authenticate(credentials: TrafficSourceCredentials): Promise<AuthResult> {
    if (!credentials.clientId || !credentials.clientSecret) {
      throw new Error('Taboola requires clientId and clientSecret')
    }

    this.clientId = credentials.clientId
    this.clientSecret = credentials.clientSecret
    // accessToken field is used to pass account ID
    this.accountId = credentials.accessToken || ''

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      logger.info({ sourceId: this.sourceId }, 'Authenticating with Taboola')

      const response = await makeRequest<{
        access_token: string
        expires_in: number
        token_type: string
      }>(buildUrl(config.baseUrl, '/oauth/token'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }).toString(),
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
    return this.authenticate({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      accessToken: this.accountId,
    })
  }

  async getCampaigns(options: ListCampaignsOptions = {}): Promise<NormalizedCampaign[]> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      const response = await makeRequest<{ results: TaboolaCampaign[] }>(
        buildUrl(config.baseUrl, `/${this.accountId}/campaigns`, {
          page: options.page,
          page_size: options.perPage || 100,
        }),
        { accessToken: this.accessToken! }
      )

      // Fetch statistics for each campaign in parallel (with rate limiting)
      const campaignsWithStats = await Promise.all(
        response.results.map(async (campaign) => {
          try {
            const stats = await this.getCampaignStatistics(String(campaign.id), options.from, options.to)
            return this.normalizeCampaign(campaign, stats)
          } catch (error) {
            logger.warn({ campaignId: campaign.id, error }, 'Failed to fetch Taboola campaign stats')
            return this.normalizeCampaign(campaign)
          }
        })
      )

      return campaignsWithStats
    })
  }

  /**
   * Fetch campaign performance statistics from Taboola
   * Uses campaign-summary reports endpoint
   */
  async getCampaignStatistics(campaignId: string, from?: string, to?: string): Promise<CampaignStats> {
    await this.ensureAuthenticated()
    await this.rateLimiter.acquire()

    // Default to last 30 days if no date range provided
    const toDate = to || new Date().toISOString().split('T')[0]
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const url = buildUrl(config.baseUrl, `/${this.accountId}/reports/campaign-summary/dimensions/campaign_breakdown`, {
      campaign: campaignId,
      start_date: fromDate,
      end_date: toDate,
    })

    logger.debug({ url, campaignId, from: fromDate, to: toDate }, 'Taboola getCampaignStatistics request')

    try {
      const response = await makeRequest<{ results: TaboolaReportResult[] }>(
        url,
        { accessToken: this.accessToken! }
      )

      // Sum up stats from all results (usually just one for campaign-level)
      const stats = response.results.reduce<CampaignStats>(
        (acc, r) => ({
          spend: acc.spend + (r.spent || 0),
          impressions: acc.impressions + (r.impressions || 0),
          clicks: acc.clicks + (r.clicks || 0),
          conversions: acc.conversions + (r.conversions || 0),
        }),
        { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
      )

      return stats
    } catch (error) {
      logger.warn({ campaignId, error }, 'Failed to fetch Taboola performance stats, returning zeros')
      return { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
    }
  }

  async getCampaign(campaignId: string): Promise<NormalizedCampaign> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      const response = await makeRequest<TaboolaCampaign>(
        buildUrl(config.baseUrl, `/${this.accountId}/campaigns/${campaignId}`),
        { accessToken: this.accessToken! }
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

      await makeRequest(
        buildUrl(config.baseUrl, `/${this.accountId}/campaigns/${campaignId}`),
        {
          method: 'PUT',
          accessToken: this.accessToken!,
          body: JSON.stringify({ is_active: newEnabled }),
        }
      )

      return { enabled: newEnabled }
    })
  }

  async getWidgets(options: ListWidgetsOptions): Promise<NormalizedWidget[]> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      const response = await makeRequest<{ results: TaboolaWidget[] }>(
        buildUrl(config.baseUrl, `/${this.accountId}/campaigns/${options.campaignId}/performance/site`, {
          page: options.page,
          page_size: options.perPage || 100,
        }),
        { accessToken: this.accessToken! }
      )

      return response.results.map((w) => this.normalizeWidget(w, options.campaignId))
    })
  }

  async blacklistWidget(campaignId: string, widgetId: string): Promise<BlacklistResult> {
    await this.ensureAuthenticated()

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      try {
        await makeRequest(
          buildUrl(config.baseUrl, `/${this.accountId}/campaigns/${campaignId}/blocking`),
          {
            method: 'POST',
            accessToken: this.accessToken!,
            body: JSON.stringify({
              type: 'SITE',
              values: [widgetId],
            }),
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
          buildUrl(config.baseUrl, `/${this.accountId}/campaigns/${campaignId}/performance/site/${widgetId}`),
          {
            method: 'POST',
            accessToken: this.accessToken!,
            body: JSON.stringify({ cpc_modification: newBid }),
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

  private normalizeCampaign(campaign: TaboolaCampaign, stats?: CampaignStats): NormalizedCampaign {
    // Use fetched stats if available, otherwise fall back to campaign-level data
    const metricsSource = stats || campaign
    return {
      id: `taboola-${campaign.id}`,
      externalId: String(campaign.id),
      sourceId: 'taboola',
      sourceAccountId: '',
      name: campaign.name,
      status: this.mapStatus(campaign.status),
      enabled: campaign.is_active,
      budget: campaign.spending_limit || 'unlimited',
      bid: campaign.cpc || 0,
      metrics: extractMetrics(metricsSource),
      createdAt: campaign.start_date || new Date().toISOString(),
      updatedAt: campaign.last_modified || campaign.start_date || new Date().toISOString(),
    }
  }

  private normalizeWidget(widget: TaboolaWidget, campaignId: string): NormalizedWidget {
    return {
      id: `taboola-${widget.site}`,
      externalId: widget.site,
      campaignId,
      name: widget.site_name || widget.site,
      domain: widget.site,
      enabled: !widget.blocked,
      metrics: extractMetrics(widget),
    }
  }

  private mapStatus(status: string): 'active' | 'paused' | 'deleted' | 'pending' {
    switch (status?.toUpperCase()) {
      case 'RUNNING':
      case 'ACTIVE':
        return 'active'
      case 'PAUSED':
      case 'FROZEN':
        return 'paused'
      case 'TERMINATED':
      case 'DELETED':
        return 'deleted'
      default:
        return 'pending'
    }
  }
}

// Taboola API types
interface TaboolaCampaign {
  id: string
  name: string
  status: string
  is_active: boolean
  spending_limit?: number
  cpc?: number
  spent?: number
  impressions?: number
  clicks?: number
  conversions?: number
  start_date?: string
  last_modified?: string
}

interface TaboolaWidget {
  site: string
  site_name?: string
  blocked?: boolean
  spent?: number
  impressions?: number
  clicks?: number
  conversions?: number
  cpc?: number
}

interface TaboolaReportResult {
  campaign?: string
  campaign_name?: string
  spent?: number
  impressions?: number
  clicks?: number
  conversions?: number
}
