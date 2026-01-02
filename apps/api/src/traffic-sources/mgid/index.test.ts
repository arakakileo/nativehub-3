import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MgidSource } from './index.js'

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

describe('MgidSource', () => {
  let source: MgidSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new MgidSource()
  })

  describe('authenticate', () => {
    it('should authenticate with valid API key', async () => {
      const result = await source.authenticate({
        clientId: 'mgid-api-key-123',
        clientSecret: 'client-456',
      })

      expect(result.accessToken).toBe('mgid-api-key-123')
      // API key doesn't expire (1 year set)
      expect(result.expiresIn).toBe(365 * 24 * 60 * 60)
    })

    it('should throw error when API key (clientId) is missing', async () => {
      await expect(source.authenticate({
        clientSecret: 'client-456',
      })).rejects.toThrow('MGID requires clientId (API key)')
    })
  })

  describe('getCampaigns', () => {
    beforeEach(async () => {
      await source.authenticate({
        clientId: 'api-key',
        clientSecret: 'client-123',
      })
    })

    it('should fetch and normalize campaigns', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        campaigns: [
          {
            id: 789,
            name: 'MGID Campaign',
            status: 'active',
            daily_budget: 200,
            cpc: 0.25,
            spent: 85,
            impressions: 40000,
            clicks: 340,
            conversions: 8,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      })

      const campaigns = await source.getCampaigns()

      expect(campaigns).toHaveLength(1)
      expect(campaigns[0]).toMatchObject({
        id: 'mgid-789',
        externalId: '789',
        sourceId: 'mgid',
        name: 'MGID Campaign',
        status: 'active',
        enabled: true,
        bid: 0.25,
      })
    })

    it('should calculate metrics correctly', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        campaigns: [
          {
            id: 123,
            name: 'Test',
            status: 'active',
            cpc: 0.5,
            spent: 100,
            impressions: 10000,
            clicks: 200,
            conversions: 4,
            created_at: '2026-01-01',
          },
        ],
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
      vi.mocked(makeRequest).mockResolvedValueOnce({
        campaigns: [
          { id: 1, name: 'Active', status: 'active', created_at: '2026-01-01' },
          { id: 2, name: 'Running', status: 'running', created_at: '2026-01-01' },
          { id: 3, name: 'Paused', status: 'paused', created_at: '2026-01-01' },
          { id: 4, name: 'Archived', status: 'archived', created_at: '2026-01-01' },
          { id: 5, name: 'New', status: 'new', created_at: '2026-01-01' },
        ],
      })

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
      await source.authenticate({
        clientId: 'api-key',
        clientSecret: 'client-123',
      })
    })

    it('should fetch and normalize widgets', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        widgets: [
          {
            id: 999,
            name: 'Top Widget',
            domain: 'topsite.com',
            blocked: false,
            spent: 30,
            impressions: 3000,
            clicks: 60,
            conversions: 2,
          },
        ],
      })

      const widgets = await source.getWidgets({ campaignId: 'camp-123' })

      expect(widgets).toHaveLength(1)
      expect(widgets[0]).toMatchObject({
        id: 'mgid-999',
        externalId: '999',
        campaignId: 'camp-123',
        name: 'Top Widget',
        domain: 'topsite.com',
        enabled: true,
      })
    })

    it('should handle widgets without name', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        widgets: [
          {
            id: 888,
            domain: 'unnamed.com',
            blocked: false,
          },
        ],
      })

      const widgets = await source.getWidgets({ campaignId: 'camp-123' })

      expect(widgets[0].name).toBe('unnamed.com')
    })

    it('should handle widgets without name and domain', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        widgets: [
          {
            id: 777,
            blocked: false,
          },
        ],
      })

      const widgets = await source.getWidgets({ campaignId: 'camp-123' })

      expect(widgets[0].name).toBe('Widget 777')
    })
  })

  describe('blacklistWidget', () => {
    beforeEach(async () => {
      await source.authenticate({
        clientId: 'api-key',
        clientSecret: 'client-123',
      })
    })

    it('should blacklist widget successfully', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({ success: true })

      const result = await source.blacklistWidget('camp-123', '999')

      expect(result.success).toBe(true)
      expect(result.widgetId).toBe('999')
    })

    it('should return error when blacklist fails', async () => {
      vi.mocked(makeRequest).mockRejectedValueOnce(new Error('Block operation failed'))

      const result = await source.blacklistWidget('camp-123', '999')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Block operation failed')
    })
  })

  describe('adjustWidgetBid', () => {
    beforeEach(async () => {
      await source.authenticate({
        clientId: 'api-key',
        clientSecret: 'client-123',
      })
    })

    it('should adjust bid successfully', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        widgets: [{ id: 999, cpc: 0.3 }],
      })
      vi.mocked(makeRequest).mockResolvedValueOnce({ success: true })

      const result = await source.adjustWidgetBid('camp-123', '999', 0.45)

      expect(result.success).toBe(true)
      expect(result.newBid).toBe(0.45)
    })

    it('should return error when bid adjustment fails', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({ widgets: [] })
      vi.mocked(makeRequest).mockRejectedValueOnce(new Error('Bid update failed'))

      const result = await source.adjustWidgetBid('camp-123', '999', 0.45)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Bid update failed')
    })
  })

  describe('refreshAuth', () => {
    it('should return same API key (no actual refresh needed)', async () => {
      await source.authenticate({
        clientId: 'my-api-key',
        clientSecret: 'client-123',
      })

      const result = await source.refreshAuth()

      expect(result.accessToken).toBe('my-api-key')
    })
  })

  describe('toggleCampaign', () => {
    beforeEach(async () => {
      await source.authenticate({
        clientId: 'api-key',
        clientSecret: 'client-123',
      })
    })

    it('should toggle campaign from active to paused', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        id: 123,
        name: 'Test',
        status: 'active',
        created_at: '2026-01-01',
      })
      vi.mocked(makeRequest).mockResolvedValueOnce({ success: true })

      const result = await source.toggleCampaign('123')

      expect(result.enabled).toBe(false)
    })

    it('should toggle campaign from paused to active', async () => {
      vi.mocked(makeRequest).mockResolvedValueOnce({
        id: 123,
        name: 'Test',
        status: 'paused',
        created_at: '2026-01-01',
      })
      vi.mocked(makeRequest).mockResolvedValueOnce({ success: true })

      const result = await source.toggleCampaign('123')

      expect(result.enabled).toBe(true)
    })
  })
})
