import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TaboolaSource } from './index.js'

// Mock the utils
vi.mock('../utils/request-helpers.js', () => ({
  makeRequest: vi.fn(),
  buildUrl: vi.fn((base, path, params = {}) => {
    const url = new URL(path, base)
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value))
    })
    return url.toString()
  }),
  extractMetrics: vi.fn((data: { spent?: number; spend?: number; impressions?: number; clicks?: number; conversions?: number; cpc?: number }) => {
    const spend = data.spent || data.spend || 0
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
      cpc: data.cpc || (clicks > 0 ? spend / clicks : 0),
    }
  }),
}))

vi.mock('../utils/retry.js', () => ({
  withRetry: vi.fn(async (fn) => fn()),
}))

vi.mock('../utils/rate-limiter.js', () => ({
  getRateLimiter: vi.fn(() => ({
    acquire: vi.fn(),
  })),
}))

import { makeRequest } from '../utils/request-helpers.js'

describe('TaboolaSource', () => {
  let source: TaboolaSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new TaboolaSource()
  })

  describe('authenticate', () => {
    it('should authenticate with valid credentials', async () => {
      vi.mocked(makeRequest).mockResolvedValue({
        access_token: 'taboola-test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })

      const result = await source.authenticate({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accessToken: 'account-123',
      })

      expect(result.accessToken).toBe('taboola-test-token')
      expect(result.expiresIn).toBe(3600)
    })

    it('should throw error when clientId is missing', async () => {
      await expect(source.authenticate({
        clientSecret: 'test-secret',
      })).rejects.toThrow('Taboola requires clientId and clientSecret')
    })

    it('should throw error when clientSecret is missing', async () => {
      await expect(source.authenticate({
        clientId: 'test-id',
      })).rejects.toThrow('Taboola requires clientId and clientSecret')
    })
  })

  describe('getCampaigns', () => {
    beforeEach(async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })
      await source.authenticate({
        clientId: 'id',
        clientSecret: 'secret',
        accessToken: 'account-123',
      })
    })

    it('should fetch and normalize campaigns', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        results: [
          {
            id: 'camp-123',
            name: 'Taboola Campaign',
            status: 'RUNNING',
            is_active: true,
            spending_limit: 500,
            cpc: 0.35,
            spent: 125,
            impressions: 50000,
            clicks: 350,
            conversions: 12,
            start_date: '2026-01-01T00:00:00Z',
          },
        ],
      })

      const campaigns = await source.getCampaigns()

      expect(campaigns).toHaveLength(1)
      expect(campaigns[0]).toMatchObject({
        id: 'taboola-camp-123',
        externalId: 'camp-123',
        sourceId: 'taboola',
        name: 'Taboola Campaign',
        status: 'active',
        enabled: true,
        bid: 0.35,
      })
    })

    it('should calculate metrics correctly', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        results: [
          {
            id: 'camp-123',
            name: 'Test',
            status: 'RUNNING',
            is_active: true,
            cpc: 0.5,
            spent: 100,
            impressions: 10000,
            clicks: 200,
            conversions: 4,
            start_date: '2026-01-01',
          },
        ],
      })

      const campaigns = await source.getCampaigns()

      expect(campaigns[0].metrics).toMatchObject({
        spend: 100,
        impressions: 10000,
        clicks: 200,
        conversions: 4,
        ctr: 2, // (200/10000) * 100
        cpa: 25, // 100/4
        cpc: 0.5,
      })
    })

    it('should handle different campaign statuses', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        results: [
          { id: '1', name: 'Active', status: 'RUNNING', is_active: true, cpc: 0.5, start_date: '2026-01-01' },
          { id: '2', name: 'Paused', status: 'PAUSED', is_active: false, cpc: 0.5, start_date: '2026-01-01' },
          { id: '3', name: 'Frozen', status: 'FROZEN', is_active: false, cpc: 0.5, start_date: '2026-01-01' },
          { id: '4', name: 'Terminated', status: 'TERMINATED', is_active: false, cpc: 0.5, start_date: '2026-01-01' },
          { id: '5', name: 'Unknown', status: 'NEW', is_active: true, cpc: 0.5, start_date: '2026-01-01' },
        ],
      })

      const campaigns = await source.getCampaigns()

      expect(campaigns[0].status).toBe('active')
      expect(campaigns[1].status).toBe('paused')
      expect(campaigns[2].status).toBe('paused')
      expect(campaigns[3].status).toBe('deleted')
      expect(campaigns[4].status).toBe('pending')
    })
  })

  describe('getWidgets', () => {
    beforeEach(async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })
      await source.authenticate({
        clientId: 'id',
        clientSecret: 'secret',
        accessToken: 'account-123',
      })
    })

    it('should fetch and normalize widgets', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        results: [
          {
            site: 'publisher.com',
            site_name: 'Publisher Site',
            blocked: false,
            spent: 50,
            impressions: 5000,
            clicks: 100,
            conversions: 3,
          },
        ],
      })

      const widgets = await source.getWidgets({ campaignId: 'camp-123' })

      expect(widgets).toHaveLength(1)
      expect(widgets[0]).toMatchObject({
        id: 'taboola-publisher.com',
        externalId: 'publisher.com',
        campaignId: 'camp-123',
        name: 'Publisher Site',
        domain: 'publisher.com',
        enabled: true,
      })
    })

    it('should handle widgets without site_name', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        results: [
          {
            site: 'unnamed-site.com',
            blocked: false,
          },
        ],
      })

      const widgets = await source.getWidgets({ campaignId: 'camp-123' })

      expect(widgets[0].name).toBe('unnamed-site.com')
    })
  })

  describe('blacklistWidget', () => {
    beforeEach(async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })
      await source.authenticate({
        clientId: 'id',
        clientSecret: 'secret',
        accessToken: 'account-123',
      })
    })

    it('should blacklist widget successfully', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({ success: true })

      const result = await source.blacklistWidget('camp-123', 'bad-widget.com')

      expect(result.success).toBe(true)
      expect(result.widgetId).toBe('bad-widget.com')
    })

    it('should return error when blacklist fails', async () => {
      vi.mocked(makeRequest).mockRejectedValueOnce(new Error('Blocking failed'))

      const result = await source.blacklistWidget('camp-123', 'widget.com')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Blocking failed')
    })
  })

  describe('adjustWidgetBid', () => {
    beforeEach(async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })
      await source.authenticate({
        clientId: 'id',
        clientSecret: 'secret',
        accessToken: 'account-123',
      })
    })

    it('should adjust bid successfully', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        results: [{ site: 'widget.com', cpc: 0.5 }],
      })
      vi.mocked(makeRequest).mockResolvedValueOnce({ success: true })

      const result = await source.adjustWidgetBid('camp-123', 'widget.com', 0.75)

      expect(result.success).toBe(true)
      expect(result.newBid).toBe(0.75)
    })

    it('should return error when bid adjustment fails', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({ results: [] })
      vi.mocked(makeRequest).mockRejectedValueOnce(new Error('Bid adjustment failed'))

      const result = await source.adjustWidgetBid('camp-123', 'widget.com', 0.75)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Bid adjustment failed')
    })
  })

  describe('refreshAuth', () => {
    it('should re-authenticate using stored credentials', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        access_token: 'initial-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })
      await source.authenticate({
        clientId: 'my-id',
        clientSecret: 'my-secret',
        accessToken: 'account-123',
      })

      vi.mocked(makeRequest).mockResolvedValueOnce({
        access_token: 'refreshed-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })
      const result = await source.refreshAuth()

      expect(result.accessToken).toBe('refreshed-token')
    })
  })
})
