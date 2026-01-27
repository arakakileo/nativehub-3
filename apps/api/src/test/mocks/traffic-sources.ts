/**
 * Mock implementations for traffic source APIs
 * Used in unit tests to avoid real API calls
 */

import { vi } from 'vitest'
import {
  mockRevcontentCampaignsResponse,
  mockRevcontentWidgetsResponse,
  mockOAuthTokenResponse,
} from '../fixtures/index.js'

// Mock fetch for traffic source API calls
export const createMockFetch = () => {
  return vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    const urlStr = url.toString()

    // OAuth token endpoint
    if (urlStr.includes('/oauth/token')) {
      return new Response(JSON.stringify(mockOAuthTokenResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Revcontent campaigns (boosts)
    if (urlStr.includes('/boosts') && !urlStr.includes('/widgets')) {
      return new Response(JSON.stringify(mockRevcontentCampaignsResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Revcontent widgets
    if (urlStr.includes('/widgets')) {
      return new Response(JSON.stringify(mockRevcontentWidgetsResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Default 404
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

// Create mock traffic source class
export const createMockTrafficSource = () => ({
  authenticate: vi.fn().mockResolvedValue({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: new Date(Date.now() + 3600000),
  }),

  refreshAuth: vi.fn().mockResolvedValue({
    accessToken: 'new-test-token',
    refreshToken: 'new-test-refresh',
    expiresAt: new Date(Date.now() + 3600000),
  }),

  getCampaigns: vi.fn().mockResolvedValue([
    {
      id: '123',
      externalId: 'ext-123',
      name: 'Test Campaign',
      status: 'active',
      enabled: true,
      budget: 100,
      bid: 0.5,
      metrics: {
        spend: 25,
        impressions: 10000,
        clicks: 150,
        conversions: 5,
        ctr: 1.5,
        cpa: 5,
      },
    },
  ]),

  getCampaign: vi.fn().mockResolvedValue({
    id: '123',
    externalId: 'ext-123',
    name: 'Test Campaign',
    status: 'active',
    enabled: true,
    budget: 100,
    bid: 0.5,
    metrics: {
      spend: 25,
      impressions: 10000,
      clicks: 150,
      conversions: 5,
      ctr: 1.5,
      cpa: 5,
    },
  }),

  getWidgets: vi.fn().mockResolvedValue([
    {
      widgetId: 'widget-001',
      name: 'Publisher A',
      domain: 'publisher-a.com',
      bidModifier: 1.0,
      metrics: {
        spend: 10.5,
        impressions: 2000,
        clicks: 30,
        conversions: 1,
        ctr: 1.5,
        cpa: 10.5,
      },
    },
  ]),

  blacklistWidget: vi.fn().mockResolvedValue(undefined),

  adjustWidgetBid: vi.fn().mockResolvedValue(undefined),

  toggleCampaign: vi.fn().mockResolvedValue(undefined),
})

// Helper to install mock fetch globally
export const installMockFetch = () => {
  const mockFetch = createMockFetch()
  vi.stubGlobal('fetch', mockFetch)
  return mockFetch
}

// Helper to restore original fetch
export const restoreFetch = () => {
  vi.unstubAllGlobals()
}
