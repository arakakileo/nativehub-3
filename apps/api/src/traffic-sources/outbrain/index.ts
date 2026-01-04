import type { NormalizedCampaign, NormalizedWidget } from '@nativehub/shared'
import {
  BaseTrafficSource,
  type TrafficSourceCredentials,
  type AuthResult,
  type ListCampaignsOptions,
  type ListWidgetsOptions,
  type BlacklistResult,
  type BidAdjustmentResult,
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
    logger.debug({ sourceId: this.sourceId, marketerId: this.marketerId }, 'Restored Outbrain token with marketerId')
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

    return withRetry(async () => {
      await this.rateLimiter.acquire()

      // Outbrain API limits to 50 items per page
      const limit = Math.min(options.perPage || 50, 50)
      const url = buildUrl(config.baseUrl, `/marketers/${this.marketerId}/campaigns`, {
        offset: options.page ? (options.page - 1) * limit : 0,
        limit,
      })

      logger.debug({ url, marketerId: this.marketerId }, 'Outbrain getCampaigns request')

      const response = await makeRequest<{ campaigns: OutbrainCampaign[] }>(
        url,
        {
          headers: {
            'OB-TOKEN-V1': this.accessToken!,
          },
        }
      )

      return response.campaigns.map((c) => this.normalizeCampaign(c))
    })
  }

  async getCampaign(campaignId: string): Promise<NormalizedCampaign> {
    await this.ensureAuthenticated()

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

  private normalizeCampaign(campaign: OutbrainCampaign): NormalizedCampaign {
    return {
      id: `outbrain-${campaign.id}`,
      externalId: campaign.id,
      sourceId: 'outbrain',
      sourceAccountId: '',
      name: campaign.name,
      status: this.mapStatus(campaign.status),
      enabled: campaign.enabled,
      budget: campaign.budget?.amount || 'unlimited',
      bid: campaign.cpc || 0,
      metrics: extractMetrics(campaign),
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

  private mapStatus(status: string): 'active' | 'paused' | 'deleted' | 'pending' {
    switch (status?.toUpperCase()) {
      case 'RUNNING':
      case 'LIVE':
        return 'active'
      case 'PAUSED':
      case 'STOPPED':
        return 'paused'
      case 'DELETED':
      case 'REJECTED':
        return 'deleted'
      default:
        return 'pending'
    }
  }
}

// Outbrain API types
interface OutbrainCampaign {
  id: string
  name: string
  status: string
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
