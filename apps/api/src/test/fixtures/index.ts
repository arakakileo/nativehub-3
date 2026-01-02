/**
 * Test fixtures for NativeHub API tests
 * Provides consistent test data across all test files
 */

export const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
export const TEST_USER_ID_2 = '550e8400-e29b-41d4-a716-446655440001'

// Source account test data
export const createSourceAccountFixture = (overrides: Record<string, unknown> = {}) => ({
  userId: TEST_USER_ID,
  sourceId: 'revcontent' as const,
  name: 'Test Revcontent Account',
  credentials: {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
  },
  ...overrides,
})

// Campaign sync test data
export const createCampaignSyncFixture = (overrides: Record<string, unknown> = {}) => ({
  externalCampaignId: 'ext-campaign-123',
  campaignName: 'Test Campaign',
  status: 'active',
  enabled: true,
  budget: '100.00',
  bid: '0.50',
  spend: '25.00',
  impressions: 10000,
  clicks: 150,
  conversions: 5,
  ctr: '1.50',
  cpa: '5.00',
  ...overrides,
})

// Widget blacklist test data
export const createWidgetBlacklistFixture = (overrides: Record<string, unknown> = {}) => ({
  widgetId: 'widget-123',
  widgetDomain: 'example.com',
  reason: 'Low performance - high CPA',
  autoBlacklisted: true,
  metricsAtBlacklist: {
    spend: 50,
    conversions: 0,
    cpa: null,
  },
  ...overrides,
})

// Optimizer campaign test data
export const createOptimizerCampaignFixture = (overrides: Record<string, unknown> = {}) => ({
  externalCampaignId: 'ext-campaign-123',
  enabled: true,
  targetCpa: '5.00',
  bidStrategy: 'target_cpa',
  bidStrategyConfig: {},
  ...overrides,
})

// Optimizer rule test data
export const createOptimizerRuleFixture = (overrides: Record<string, unknown> = {}) => ({
  name: 'Test Rule',
  enabled: true,
  priority: 10,
  ruleType: 'template',
  templateId: 'blacklist_no_conv',
  condition: {
    metric: 'spend',
    operator: 'gte',
    value: 10,
    timeframe: 'last_24h',
  },
  action: {
    type: 'blacklist',
    value: null,
  },
  ...overrides,
})

// Traffic source API response mocks
export const mockRevcontentCampaignsResponse = {
  data: [
    {
      id: 123,
      name: 'Test Campaign 1',
      status: 'active',
      enabled: true,
      budget: { daily: 100 },
      bid: 0.5,
      stats: {
        spend: 25.5,
        impressions: 10000,
        clicks: 150,
        conversions: 5,
      },
    },
    {
      id: 456,
      name: 'Test Campaign 2',
      status: 'paused',
      enabled: false,
      budget: { daily: 50 },
      bid: 0.35,
      stats: {
        spend: 12.25,
        impressions: 5000,
        clicks: 75,
        conversions: 2,
      },
    },
  ],
}

export const mockRevcontentWidgetsResponse = {
  data: [
    {
      widget_id: 'widget-001',
      name: 'Publisher A',
      domain: 'publisher-a.com',
      bid_modifier: 1.0,
      stats: {
        spend: 10.5,
        impressions: 2000,
        clicks: 30,
        conversions: 1,
      },
    },
    {
      widget_id: 'widget-002',
      name: 'Publisher B',
      domain: 'publisher-b.com',
      bid_modifier: 0.8,
      stats: {
        spend: 15.0,
        impressions: 3000,
        clicks: 45,
        conversions: 0,
      },
    },
  ],
}

// Auth token fixtures
export const mockOAuthTokenResponse = {
  access_token: 'test-access-token-12345',
  token_type: 'Bearer',
  expires_in: 3600,
  refresh_token: 'test-refresh-token-67890',
}
