import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RevcontentSource } from './index.js'

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

describe('RevcontentSource', () => {
  let source: RevcontentSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new RevcontentSource()
  })

  describe('authenticate', () => {
    it('should authenticate with valid credentials', async () => {
      vi.mocked(makeRequest).mockResolvedValue({
        access_token: 'test-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })

      const result = await source.authenticate({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      })

      expect(result.accessToken).toBe('test-access-token')
      expect(result.expiresIn).toBe(3600)
    })

    it('should throw error when clientId is missing', async () => {
      await expect(source.authenticate({
        clientSecret: 'test-secret',
      })).rejects.toThrow('Revcontent requires clientId and clientSecret')
    })

    it('should throw error when clientSecret is missing', async () => {
      await expect(source.authenticate({
        clientId: 'test-id',
      })).rejects.toThrow('Revcontent requires clientId and clientSecret')
    })
  })

  describe('getCampaigns', () => {
    beforeEach(async () => {
      // Authenticate first
      vi.mocked(makeRequest).mockResolvedValueOnce({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })
      await source.authenticate({ clientId: 'id', clientSecret: 'secret' })
    })

    it('should fetch and normalize campaigns', async () => {
      // Mock campaigns list
      vi.mocked(makeRequest).mockResolvedValueOnce([
        {
          id: 123,
          name: 'Test Campaign',
          status: 'active',
          enabled: true,
          budget: 100,
          bid: 0.5,
          created_at: '2026-01-01T00:00:00Z',
        },
      ])
      // Mock statistics call
      vi.mocked(makeRequest).mockResolvedValueOnce({
        spend: 25, impressions: 10000, clicks: 150, conversions: 5,
      })

      const campaigns = await source.getCampaigns()

      expect(campaigns).toHaveLength(1)
      expect(campaigns[0]).toMatchObject({
        id: 'revcontent-123',
        externalId: '123',
        sourceId: 'revcontent',
        name: 'Test Campaign',
        status: 'active',
        enabled: true,
        bid: 0.5,
      })
    })

    it('should calculate metrics correctly', async () => {
      // Mock campaigns list
      vi.mocked(makeRequest).mockResolvedValueOnce([
        {
          id: 123,
          name: 'Test',
          status: 'active',
          enabled: true,
          bid: 0.5,
          created_at: '2026-01-01T00:00:00Z',
        },
      ])
      // Mock statistics call with metrics
      vi.mocked(makeRequest).mockResolvedValueOnce({
        spend: 100, impressions: 10000, clicks: 200, conversions: 4,
      })

      const campaigns = await source.getCampaigns()

      expect(campaigns[0].metrics).toMatchObject({
        spend: 100,
        impressions: 10000,
        clicks: 200,
        conversions: 4,
        ctr: 2, // (200/10000) * 100
        cpa: 25, // 100/4
        cpc: 0.5, // 100/200
      })
    })

    it('should handle different campaign statuses', async () => {
      // Mock campaigns list
      vi.mocked(makeRequest).mockResolvedValueOnce([
        { id: 1, name: 'Active', status: 'active', enabled: true, bid: 0.5, created_at: '2026-01-01' },
        { id: 2, name: 'Paused', status: 'paused', enabled: false, bid: 0.5, created_at: '2026-01-01' },
        { id: 3, name: 'Running', status: 'running', enabled: true, bid: 0.5, created_at: '2026-01-01' },
        { id: 4, name: 'Stopped', status: 'stopped', enabled: false, bid: 0.5, created_at: '2026-01-01' },
        { id: 5, name: 'Unknown', status: 'unknown', enabled: true, bid: 0.5, created_at: '2026-01-01' },
      ])
      // Mock statistics calls for each campaign
      vi.mocked(makeRequest).mockResolvedValue({ spend: 0, impressions: 0, clicks: 0, conversions: 0 })

      const campaigns = await source.getCampaigns()

      expect(campaigns[0].status).toBe('active')
      expect(campaigns[1].status).toBe('paused')
      expect(campaigns[2].status).toBe('active')
      expect(campaigns[3].status).toBe('paused')
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
      await source.authenticate({ clientId: 'id', clientSecret: 'secret' })
    })

    it('should fetch and normalize widgets', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce([
        {
          id: 456,
          name: 'Publisher Widget',
          domain: 'publisher.com',
          enabled: true,
          spend: 10,
          impressions: 1000,
          clicks: 20,
          conversions: 1,
        },
      ])

      const widgets = await source.getWidgets({ campaignId: 'campaign-123' })

      expect(widgets).toHaveLength(1)
      expect(widgets[0]).toMatchObject({
        id: 'revcontent-456',
        externalId: '456',
        campaignId: 'campaign-123',
        name: 'Publisher Widget',
        domain: 'publisher.com',
        enabled: true,
      })
    })

    it('should handle widgets without name', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce([
        {
          id: 789,
          domain: 'test-domain.com',
          enabled: true,
        },
      ])

      const widgets = await source.getWidgets({ campaignId: 'campaign-123' })

      expect(widgets[0].name).toBe('test-domain.com')
    })
  })

  describe('blacklistWidget', () => {
    beforeEach(async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })
      await source.authenticate({ clientId: 'id', clientSecret: 'secret' })
    })

    it('should blacklist widget successfully', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({ success: true })

      const result = await source.blacklistWidget('campaign-123', 'widget-456')

      expect(result.success).toBe(true)
      expect(result.widgetId).toBe('widget-456')
    })

    it('should return error when blacklist fails', async () => {
      vi.mocked(makeRequest).mockRejectedValueOnce(new Error('API Error'))

      const result = await source.blacklistWidget('campaign-123', 'widget-456')

      expect(result.success).toBe(false)
      expect(result.error).toBe('API Error')
    })
  })

  describe('adjustWidgetBid', () => {
    beforeEach(async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        access_token: 'test-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })
      await source.authenticate({ clientId: 'id', clientSecret: 'secret' })
    })

    it('should adjust bid successfully', async () => {
      // Mock getWidgets call
      vi.mocked(makeRequest).mockResolvedValueOnce([
        { id: 456, enabled: true, spend: 10, impressions: 1000, clicks: 20 },
      ])
      // Mock bid adjustment
      vi.mocked(makeRequest).mockResolvedValueOnce({ success: true })

      const result = await source.adjustWidgetBid('campaign-123', '456', 0.75)

      expect(result.success).toBe(true)
      expect(result.newBid).toBe(0.75)
    })

    it('should return error when bid adjustment fails', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce([])
      vi.mocked(makeRequest).mockRejectedValueOnce(new Error('Bid adjustment failed'))

      const result = await source.adjustWidgetBid('campaign-123', '456', 0.75)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Bid adjustment failed')
    })
  })

  describe('refreshAuth', () => {
    it('should re-authenticate using stored credentials', async () => {
      // First authenticate
      vi.mocked(makeRequest).mockResolvedValueOnce({
        access_token: 'initial-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })
      await source.authenticate({ clientId: 'my-id', clientSecret: 'my-secret' })

      // Then refresh
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
