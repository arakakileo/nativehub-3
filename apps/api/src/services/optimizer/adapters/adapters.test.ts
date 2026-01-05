/**
 * Optimizer Adapters Tests
 *
 * Tests for source-specific optimizer adapters
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OutbrainOptimizerAdapter } from './outbrain-adapter.js'
import { TaboolaOptimizerAdapter } from './taboola-adapter.js'
import { MGIDOptimizerAdapter } from './mgid-adapter.js'
import { RevcontentOptimizerAdapter } from './revcontent-adapter.js'
import { createOptimizerAdapter, hasOptimizerSupport, getSupportedSourceIds } from './index.js'
import type { PlacementMetrics, SourceConstraints } from './interface.js'

// Mock traffic source with minimal interface
function createMockSource(sourceId: string) {
  return {
    sourceId,
    getWidgets: vi.fn().mockResolvedValue([
      {
        id: `${sourceId}-widget-1`,
        externalId: 'widget-001',
        name: 'Test Widget',
        domain: 'example.com',
        enabled: true,
        metrics: {
          spend: 100,
          impressions: 10000,
          clicks: 500,
          conversions: 5,
        },
      },
      {
        id: `${sourceId}-widget-2`,
        externalId: 'widget-002',
        name: 'Zero Conversion Widget',
        domain: 'bad-site.com',
        enabled: true,
        metrics: {
          spend: 80,
          impressions: 8000,
          clicks: 400,
          conversions: 0,
        },
      },
    ]),
    blacklistWidget: vi.fn().mockResolvedValue({ success: true, widgetId: 'widget-001' }),
    adjustWidgetBid: vi.fn().mockResolvedValue({
      success: true,
      widgetId: 'widget-001',
      previousBid: 0.5,
      newBid: 0.6,
    }),
  }
}

describe('OutbrainOptimizerAdapter', () => {
  let adapter: OutbrainOptimizerAdapter
  let mockSource: ReturnType<typeof createMockSource>

  beforeEach(() => {
    mockSource = createMockSource('outbrain')
    adapter = new OutbrainOptimizerAdapter(mockSource as any)
  })

  describe('getPlacementsWithMetrics', () => {
    it('should normalize widget data to PlacementMetrics', async () => {
      const result = await adapter.getPlacementsWithMetrics({
        campaignId: 'camp-123',
        from: '2024-01-01',
        to: '2024-01-07',
      })

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject<PlacementMetrics>({
        id: 'widget-001',
        name: 'Test Widget',
        spend: 100,
        impressions: 10000,
        clicks: 500,
        conversions: 5,
        cpc: 0.2, // 100 / 500
        cpa: 20, // 100 / 5
        ctr: 5, // 500 / 10000 * 100
      })
    })

    it('should handle zero conversions (CPA = 0)', async () => {
      const result = await adapter.getPlacementsWithMetrics({
        campaignId: 'camp-123',
        from: '2024-01-01',
        to: '2024-01-07',
      })

      expect(result[1].cpa).toBe(0)
      expect(result[1].conversions).toBe(0)
    })
  })

  describe('blockPlacement', () => {
    it('should call source.blacklistWidget and return success', async () => {
      const result = await adapter.blockPlacement({
        campaignId: 'camp-123',
        placementId: 'widget-001',
        reason: 'No conversions',
      })

      expect(result.success).toBe(true)
      expect(result.placementId).toBe('widget-001')
      expect(mockSource.blacklistWidget).toHaveBeenCalledWith('camp-123', 'widget-001')
    })

    it('should handle errors gracefully', async () => {
      mockSource.blacklistWidget.mockRejectedValueOnce(new Error('API rate limit'))

      const result = await adapter.blockPlacement({
        campaignId: 'camp-123',
        placementId: 'widget-001',
        reason: 'test',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('API rate limit')
    })
  })

  describe('getConstraints', () => {
    it('should return Outbrain-specific constraints', () => {
      const constraints = adapter.getConstraints()

      expect(constraints).toMatchObject<SourceConstraints>({
        maxBlocksPerCampaign: 30,
        minBlockThreshold: 400,
        reportingDelayHours: 4,
        rateLimit: { requestsPerSecond: 30 },
        supportsDirectBidAdjust: true,
        placementTerminology: 'publisher',
      })
    })
  })
})

describe('TaboolaOptimizerAdapter', () => {
  let adapter: TaboolaOptimizerAdapter
  let mockSource: ReturnType<typeof createMockSource>

  beforeEach(() => {
    mockSource = createMockSource('taboola')
    adapter = new TaboolaOptimizerAdapter(mockSource as any)
  })

  describe('getConstraints', () => {
    it('should return Taboola-specific constraints', () => {
      const constraints = adapter.getConstraints()

      expect(constraints.maxBlocksPerCampaign).toBe(1500)
      expect(constraints.reportingDelayHours).toBe(0) // Real-time
      expect(constraints.placementTerminology).toBe('site')
    })
  })
})

describe('MGIDOptimizerAdapter', () => {
  let adapter: MGIDOptimizerAdapter
  let mockSource: ReturnType<typeof createMockSource>

  beforeEach(() => {
    mockSource = createMockSource('mgid')
    adapter = new MGIDOptimizerAdapter(mockSource as any)
  })

  describe('adjustPlacementBid', () => {
    it('should return error - MGID does not support widget-level bids', async () => {
      const result = await adapter.adjustPlacementBid({
        campaignId: 'camp-123',
        placementId: 'widget-001',
        newBid: 0.6,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('does not support widget-level bid adjustments')
    })
  })

  describe('getConstraints', () => {
    it('should return MGID-specific constraints', () => {
      const constraints = adapter.getConstraints()

      expect(constraints.maxBlocksPerCampaign).toBeNull() // Unlimited
      expect(constraints.supportsDirectBidAdjust).toBe(false)
      expect(constraints.placementTerminology).toBe('widget')
    })
  })
})

describe('RevcontentOptimizerAdapter', () => {
  let adapter: RevcontentOptimizerAdapter
  let mockSource: ReturnType<typeof createMockSource>

  beforeEach(() => {
    mockSource = createMockSource('revcontent')
    adapter = new RevcontentOptimizerAdapter(mockSource as any)
  })

  describe('getConstraints', () => {
    it('should return Revcontent-specific constraints', () => {
      const constraints = adapter.getConstraints()

      expect(constraints.maxBlocksPerCampaign).toBeNull() // Unknown/unlimited
      expect(constraints.supportsDirectBidAdjust).toBe(true)
      expect(constraints.placementTerminology).toBe('widget')
    })
  })
})

describe('createOptimizerAdapter factory', () => {
  it('should create correct adapter for each source', () => {
    const mockSource = createMockSource('outbrain')

    expect(createOptimizerAdapter('outbrain', mockSource as any)).toBeInstanceOf(OutbrainOptimizerAdapter)
    expect(createOptimizerAdapter('taboola', mockSource as any)).toBeInstanceOf(TaboolaOptimizerAdapter)
    expect(createOptimizerAdapter('mgid', mockSource as any)).toBeInstanceOf(MGIDOptimizerAdapter)
    expect(createOptimizerAdapter('revcontent', mockSource as any)).toBeInstanceOf(RevcontentOptimizerAdapter)
  })

  it('should throw for unsupported sources', () => {
    const mockSource = createMockSource('unknown')

    expect(() => createOptimizerAdapter('unknown', mockSource as any)).toThrow('No optimizer adapter for source: unknown')
  })
})

describe('hasOptimizerSupport', () => {
  it('should return true for supported sources', () => {
    expect(hasOptimizerSupport('outbrain')).toBe(true)
    expect(hasOptimizerSupport('taboola')).toBe(true)
    expect(hasOptimizerSupport('mgid')).toBe(true)
    expect(hasOptimizerSupport('revcontent')).toBe(true)
  })

  it('should return false for unsupported sources', () => {
    expect(hasOptimizerSupport('unknown')).toBe(false)
    expect(hasOptimizerSupport('google')).toBe(false)
  })
})

describe('getSupportedSourceIds', () => {
  it('should return all supported source IDs', () => {
    const ids = getSupportedSourceIds()

    expect(ids).toContain('outbrain')
    expect(ids).toContain('taboola')
    expect(ids).toContain('mgid')
    expect(ids).toContain('revcontent')
    expect(ids).toHaveLength(4)
  })
})
