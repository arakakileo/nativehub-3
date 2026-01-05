import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OutbrainSource } from './index.js'

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

describe('OutbrainSource', () => {
  let source: OutbrainSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new OutbrainSource()
  })

  describe('authenticate', () => {
    it('should authenticate with valid credentials', async () => {
      vi.mocked(makeRequest).mockResolvedValue({
        OB_TOKEN_V1: 'outbrain-test-token',
      })

      const result = await source.authenticate({
        username: 'test@example.com',
        password: 'test-password',
        accessToken: 'marketer-123',
      })

      expect(result.accessToken).toBe('outbrain-test-token')
      // 30 days in seconds
      expect(result.expiresIn).toBe(30 * 24 * 60 * 60)
    })

    it('should throw error when username is missing', async () => {
      await expect(source.authenticate({
        password: 'test-password',
      })).rejects.toThrow('Outbrain requires username and password')
    })

    it('should throw error when password is missing', async () => {
      await expect(source.authenticate({
        username: 'test@example.com',
      })).rejects.toThrow('Outbrain requires username and password')
    })
  })

  describe('getCampaigns', () => {
    beforeEach(async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        OB_TOKEN_V1: 'test-token',
      })
      await source.authenticate({
        username: 'user',
        password: 'pass',
        accessToken: 'marketer-123',
      })
    })

    it('should fetch and normalize campaigns', async () => {
      // Mock campaigns list
      vi.mocked(makeRequest).mockResolvedValueOnce({
        campaigns: [
          {
            id: 'ob-camp-123',
            name: 'Outbrain Campaign',
            status: 'RUNNING',
            enabled: true,
            budget: { amount: 1000, currency: 'USD' },
            cpc: 0.45,
            creationTime: '2026-01-01T00:00:00Z',
          },
        ],
      })
      // Mock statistics call
      vi.mocked(makeRequest).mockResolvedValueOnce({
        results: [{ spend: 250, impressions: 100000, clicks: 550, conversions: 18 }],
      })

      const campaigns = await source.getCampaigns()

      expect(campaigns).toHaveLength(1)
      expect(campaigns[0]).toMatchObject({
        id: 'outbrain-ob-camp-123',
        externalId: 'ob-camp-123',
        sourceId: 'outbrain',
        name: 'Outbrain Campaign',
        status: 'active',
        enabled: true,
        bid: 0.45,
      })
    })

    it('should calculate metrics correctly', async () => {
      // Mock campaigns list
      vi.mocked(makeRequest).mockResolvedValueOnce({
        campaigns: [
          {
            id: 'camp-123',
            name: 'Test',
            status: 'RUNNING',
            enabled: true,
            cpc: 0.5,
            creationTime: '2026-01-01',
          },
        ],
      })
      // Mock statistics call with metrics
      vi.mocked(makeRequest).mockResolvedValueOnce({
        results: [{ spend: 100, impressions: 10000, clicks: 200, conversions: 4 }],
      })

      const campaigns = await source.getCampaigns()

      expect(campaigns[0].metrics).toMatchObject({
        spend: 100,
        impressions: 10000,
        clicks: 200,
        conversions: 4,
        ctr: 2,
        cpa: 25,
        cpc: 0.5,
      })
    })

    it('should handle different campaign statuses', async () => {
      // Mock campaigns list
      vi.mocked(makeRequest).mockResolvedValueOnce({
        campaigns: [
          { id: '1', name: 'Running', status: 'RUNNING', enabled: true, creationTime: '2026-01-01' },
          { id: '2', name: 'Live', status: 'LIVE', enabled: true, creationTime: '2026-01-01' },
          { id: '3', name: 'Paused', status: 'PAUSED', enabled: false, creationTime: '2026-01-01' },
          { id: '4', name: 'Rejected', status: 'REJECTED', enabled: false, creationTime: '2026-01-01' },
          { id: '5', name: 'Pending', status: 'PENDING', enabled: true, creationTime: '2026-01-01' },
        ],
      })
      // Mock statistics calls for each campaign
      vi.mocked(makeRequest).mockResolvedValue({ results: [] })

      const campaigns = await source.getCampaigns()

      expect(campaigns[0].status).toBe('active')
      expect(campaigns[1].status).toBe('active')
      expect(campaigns[2].status).toBe('paused')
      expect(campaigns[3].status).toBe('deleted')
      expect(campaigns[4].status).toBe('pending')
    })
  })

  describe('getWidgets', () => {
    beforeEach(async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        OB_TOKEN_V1: 'test-token',
      })
      await source.authenticate({
        username: 'user',
        password: 'pass',
        accessToken: 'marketer-123',
      })
    })

    it('should fetch and normalize publishers as widgets', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        publishers: [
          {
            id: 'pub-456',
            name: 'Premium Publisher',
            enabled: true,
            spend: 75,
            impressions: 8000,
            clicks: 160,
            conversions: 5,
          },
        ],
      })

      const widgets = await source.getWidgets({ campaignId: 'camp-123' })

      expect(widgets).toHaveLength(1)
      expect(widgets[0]).toMatchObject({
        id: 'outbrain-pub-456',
        externalId: 'pub-456',
        campaignId: 'camp-123',
        name: 'Premium Publisher',
        enabled: true,
      })
    })

    it('should handle publishers without name', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        publishers: [
          {
            id: 'pub-789',
            enabled: true,
          },
        ],
      })

      const widgets = await source.getWidgets({ campaignId: 'camp-123' })

      expect(widgets[0].name).toBe('pub-789')
    })
  })

  describe('blacklistWidget', () => {
    beforeEach(async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        OB_TOKEN_V1: 'test-token',
      })
      await source.authenticate({
        username: 'user',
        password: 'pass',
        accessToken: 'marketer-123',
      })
    })

    it('should blacklist publisher successfully', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({ success: true })

      const result = await source.blacklistWidget('camp-123', 'pub-456')

      expect(result.success).toBe(true)
      expect(result.widgetId).toBe('pub-456')
    })

    it('should return error when blacklist fails', async () => {
      vi.mocked(makeRequest).mockRejectedValueOnce(new Error('Publisher block failed'))

      const result = await source.blacklistWidget('camp-123', 'pub-456')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Publisher block failed')
    })
  })

  describe('adjustWidgetBid', () => {
    beforeEach(async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        OB_TOKEN_V1: 'test-token',
      })
      await source.authenticate({
        username: 'user',
        password: 'pass',
        accessToken: 'marketer-123',
      })
    })

    it('should adjust bid successfully', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        publishers: [{ id: 'pub-456', cpc: 0.5 }],
      })
      vi.mocked(makeRequest).mockResolvedValueOnce({ success: true })

      const result = await source.adjustWidgetBid('camp-123', 'pub-456', 0.65)

      expect(result.success).toBe(true)
      expect(result.newBid).toBe(0.65)
    })

    it('should return error when bid adjustment fails', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({ publishers: [] })
      vi.mocked(makeRequest).mockRejectedValueOnce(new Error('Bid modification failed'))

      const result = await source.adjustWidgetBid('camp-123', 'pub-456', 0.65)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Bid modification failed')
    })
  })

  describe('refreshAuth', () => {
    it('should re-authenticate using stored credentials', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        OB_TOKEN_V1: 'initial-token',
      })
      await source.authenticate({
        username: 'user@email.com',
        password: 'password123',
        accessToken: 'marketer-123',
      })

      vi.mocked(makeRequest).mockResolvedValueOnce({
        OB_TOKEN_V1: 'refreshed-token',
      })
      const result = await source.refreshAuth()

      expect(result.accessToken).toBe('refreshed-token')
    })
  })
})
