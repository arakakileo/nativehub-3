/**
 * Anomaly Detection Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnomalyDetectionService } from './anomaly-detection.service.js'

// Mock dependencies
vi.mock('../../lib/db.js', () => ({
  db: {
    select: vi.fn(),
  },
}))

vi.mock('../notification/index.js', () => ({
  notificationService: {
    send: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('AnomalyDetectionService', () => {
  let service: AnomalyDetectionService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new AnomalyDetectionService()
  })

  describe('detectAnomalies', () => {
    it('should detect spend spike anomaly', async () => {
      const { db } = await import('../../lib/db.js')

      // Historical spend around $100, current spike to $500
      const mockSyncs = [
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '500', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date() },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '100', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 86400000) },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '105', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 172800000) },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '95', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 259200000) },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '98', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 345600000) },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '102', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 432000000) },
      ]

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockSyncs),
          }),
        }),
      })

      const anomalies = await service.detectAnomalies('test-account')

      const spendAnomaly = anomalies.find(a => a.type === 'spend_spike')
      expect(spendAnomaly).toBeDefined()
      expect(spendAnomaly?.severity).toBe('critical')
      expect(spendAnomaly?.message).toContain('Spend spike')
    })

    it('should detect CPA spike anomaly', async () => {
      const { db } = await import('../../lib/db.js')

      // Historical CPA around $20, current spike to $100
      const mockSyncs = [
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '500', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date() },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '100', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 86400000) },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '105', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 172800000) },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '95', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 259200000) },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '98', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 345600000) },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '102', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 432000000) },
      ]

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockSyncs),
          }),
        }),
      })

      const anomalies = await service.detectAnomalies('test-account')

      const cpaAnomaly = anomalies.find(a => a.type === 'cpa_spike')
      expect(cpaAnomaly).toBeDefined()
      expect(cpaAnomaly?.message).toContain('CPA spike')
    })

    it('should detect conversion drop anomaly', async () => {
      const { db } = await import('../../lib/db.js')

      // Historical conversions around 10, current drop to 1
      const mockSyncs = [
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '100', conversions: 1, impressions: 10000, clicks: 200, syncedAt: new Date() },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '100', conversions: 10, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 86400000) },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '100', conversions: 11, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 172800000) },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '100', conversions: 9, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 259200000) },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '100', conversions: 10, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 345600000) },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '100', conversions: 12, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 432000000) },
      ]

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockSyncs),
          }),
        }),
      })

      const anomalies = await service.detectAnomalies('test-account')

      const conversionAnomaly = anomalies.find(a => a.type === 'conversion_drop')
      expect(conversionAnomaly).toBeDefined()
      expect(conversionAnomaly?.message).toContain('Conversion drop')
    })

    it('should return empty array for insufficient data', async () => {
      const { db } = await import('../../lib/db.js')

      // Only 3 syncs - below minimum
      const mockSyncs = [
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '100', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date() },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '100', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 86400000) },
        { externalCampaignId: 'camp1', campaignName: 'Campaign 1', spend: '100', conversions: 5, impressions: 10000, clicks: 200, syncedAt: new Date(Date.now() - 172800000) },
      ]

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockSyncs),
          }),
        }),
      })

      const anomalies = await service.detectAnomalies('test-account')
      expect(anomalies).toHaveLength(0)
    })

    it('should return empty array for no data', async () => {
      const { db } = await import('../../lib/db.js')

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      })

      const anomalies = await service.detectAnomalies('test-account')
      expect(anomalies).toHaveLength(0)
    })
  })

  describe('sendAnomalyAlerts', () => {
    it('should send alerts for critical anomalies', async () => {
      const { db } = await import('../../lib/db.js')
      const { notificationService } = await import('../notification/index.js')

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { phone: '+5511999999999', notificationsEnabled: true },
            ]),
          }),
        }),
      })

      const anomalies = [
        {
          type: 'spend_spike' as const,
          severity: 'critical' as const,
          campaignId: 'camp1',
          campaignName: 'Campaign 1',
          metric: 'spend',
          currentValue: 500,
          expectedValue: 100,
          deviation: 4.0,
          message: 'Spend spike: $500 vs avg $100',
        },
      ]

      await service.sendAnomalyAlerts({
        userId: 'user-1',
        sourceAccountId: 'account-1',
        anomalies,
      })

      expect(notificationService.send).toHaveBeenCalledTimes(1)
      expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        alertType: 'critical_spend',
        severity: 'critical',
      }))
    })

    it('should not send alerts if user has notifications disabled', async () => {
      const { db } = await import('../../lib/db.js')
      const { notificationService } = await import('../notification/index.js')

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { phone: '+5511999999999', notificationsEnabled: false },
            ]),
          }),
        }),
      })

      const anomalies = [
        {
          type: 'spend_spike' as const,
          severity: 'critical' as const,
          campaignId: 'camp1',
          campaignName: 'Campaign 1',
          metric: 'spend',
          currentValue: 500,
          expectedValue: 100,
          deviation: 4.0,
          message: 'Spend spike',
        },
      ]

      await service.sendAnomalyAlerts({
        userId: 'user-1',
        sourceAccountId: 'account-1',
        anomalies,
      })

      expect(notificationService.send).not.toHaveBeenCalled()
    })

    it('should limit critical alerts to 3', async () => {
      const { db } = await import('../../lib/db.js')
      const { notificationService } = await import('../notification/index.js')

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { phone: '+5511999999999', notificationsEnabled: true },
            ]),
          }),
        }),
      })

      // 5 critical anomalies
      const anomalies = Array.from({ length: 5 }, (_, i) => ({
        type: 'spend_spike' as const,
        severity: 'critical' as const,
        campaignId: `camp${i}`,
        campaignName: `Campaign ${i}`,
        metric: 'spend',
        currentValue: 500,
        expectedValue: 100,
        deviation: 4.0,
        message: 'Spend spike',
      }))

      await service.sendAnomalyAlerts({
        userId: 'user-1',
        sourceAccountId: 'account-1',
        anomalies,
      })

      // Should only send 3 alerts
      expect(notificationService.send).toHaveBeenCalledTimes(3)
    })
  })
})
