import type { NormalizedCampaign, NormalizedWidget, CampaignMetrics } from '@nativehub/shared'

/**
 * Credentials for authenticating with traffic sources
 */
export interface TrafficSourceCredentials {
  clientId?: string
  clientSecret?: string
  username?: string
  password?: string
  accessToken?: string
  refreshToken?: string
  accountId?: string // External account/marketer ID
}

/**
 * Result from authentication
 */
export interface AuthResult {
  accessToken: string
  refreshToken?: string
  expiresIn: number // seconds
}

/**
 * Options for listing campaigns
 */
export interface ListCampaignsOptions {
  status?: 'active' | 'paused' | 'deleted' | 'all'
  page?: number
  perPage?: number
}

/**
 * Options for listing widgets
 */
export interface ListWidgetsOptions {
  campaignId: string
  page?: number
  perPage?: number
}

/**
 * Widget blacklist result
 */
export interface BlacklistResult {
  success: boolean
  widgetId: string
  error?: string
}

/**
 * Bid adjustment result
 */
export interface BidAdjustmentResult {
  success: boolean
  widgetId: string
  previousBid: number
  newBid: number
  error?: string
}

/**
 * Base interface for all traffic sources
 */
export interface TrafficSource {
  readonly sourceId: string

  // Authentication
  authenticate(credentials: TrafficSourceCredentials): Promise<AuthResult>
  refreshAuth(): Promise<AuthResult>
  isAuthenticated(): boolean

  // Token management
  setStoredToken(token: string, expiresAt: Date): void
  getStoredToken(): { token: string; expiresAt: Date } | null

  // Campaigns
  getCampaigns(options?: ListCampaignsOptions): Promise<NormalizedCampaign[]>
  getCampaign(campaignId: string): Promise<NormalizedCampaign>
  toggleCampaign(campaignId: string): Promise<{ enabled: boolean }>

  // Widgets
  getWidgets(options: ListWidgetsOptions): Promise<NormalizedWidget[]>
  blacklistWidget(campaignId: string, widgetId: string): Promise<BlacklistResult>
  adjustWidgetBid(campaignId: string, widgetId: string, newBid: number): Promise<BidAdjustmentResult>
}

/**
 * Abstract base class with common functionality
 */
export abstract class BaseTrafficSource implements TrafficSource {
  abstract readonly sourceId: string

  protected accessToken: string | null = null
  protected refreshToken: string | null = null
  protected tokenExpiresAt: number = 0
  protected storedToken: { token: string; expiresAt: Date } | null = null

  // Token management
  setStoredToken(token: string, expiresAt: Date): void {
    this.storedToken = { token, expiresAt }
    this.accessToken = token
    this.tokenExpiresAt = expiresAt.getTime()
  }

  getStoredToken(): { token: string; expiresAt: Date } | null {
    return this.storedToken
  }

  isAuthenticated(): boolean {
    return Boolean(this.accessToken && this.tokenExpiresAt > Date.now())
  }

  protected isTokenExpiringSoon(bufferSeconds: number = 300): boolean {
    return this.tokenExpiresAt - Date.now() < bufferSeconds * 1000
  }

  // Abstract methods that must be implemented
  abstract authenticate(credentials: TrafficSourceCredentials): Promise<AuthResult>
  abstract refreshAuth(): Promise<AuthResult>
  abstract getCampaigns(options?: ListCampaignsOptions): Promise<NormalizedCampaign[]>
  abstract getCampaign(campaignId: string): Promise<NormalizedCampaign>
  abstract toggleCampaign(campaignId: string): Promise<{ enabled: boolean }>
  abstract getWidgets(options: ListWidgetsOptions): Promise<NormalizedWidget[]>
  abstract blacklistWidget(campaignId: string, widgetId: string): Promise<BlacklistResult>
  abstract adjustWidgetBid(campaignId: string, widgetId: string, newBid: number): Promise<BidAdjustmentResult>
}
