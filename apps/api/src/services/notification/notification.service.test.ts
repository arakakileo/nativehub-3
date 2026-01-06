/**
 * Notification Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before import
vi.mock('./evolution-api.js', () => ({
  evolutionApi: {
    isConfigured: vi.fn().mockReturnValue(true),
    sendText: vi.fn().mockResolvedValue({ key: { id: 'msg-123' }, message: { conversation: '' } }),
  },
}))

vi.mock('../../lib/db.js', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import after mocks
import { NotificationService } from './notification.service.js'
import { evolutionApi } from './evolution-api.js'
import { db } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'

describe('NotificationService', () => {
  let service: NotificationService
  const mockSendText = evolutionApi.sendText as ReturnType<typeof vi.fn>
  const mockIsConfigured = evolutionApi.isConfigured as ReturnType<typeof vi.fn>
  const mockInsert = db.insert as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsConfigured.mockReturnValue(true)
    mockSendText.mockResolvedValue({ key: { id: 'msg-123' }, message: { conversation: '' } })
    service = new NotificationService()
  })

  describe('send', () => {
    it('should send notification and log to database', async () => {
      await service.send({
        userId: 'user-123',
        phone: '5511999999999',
        alertType: 'action_executed',
        severity: 'info',
        title: 'Test Alert',
        message: 'This is a test message',
      })

      expect(mockSendText).toHaveBeenCalledWith({
        phone: '5511999999999',
        message: expect.stringContaining('*Test Alert*'),
      })
      expect(mockInsert).toHaveBeenCalled()
    })

    it('should include emoji based on severity', async () => {
      // Test critical emoji
      await service.send({
        userId: 'user-123',
        phone: '5511999999999',
        alertType: 'critical_spend',
        severity: 'critical',
        title: 'Critical Alert',
        message: 'Something critical',
      })

      expect(mockSendText).toHaveBeenCalledWith({
        phone: '5511999999999',
        message: expect.stringContaining('🚨'),
      })
    })

    it('should include data block when provided', async () => {
      await service.send({
        userId: 'user-123',
        phone: '5511999999999',
        alertType: 'action_executed',
        severity: 'info',
        title: 'Action',
        message: 'Details',
        data: { spend: '$100', conversions: 5 },
      })

      const call = mockSendText.mock.calls[0][0]
      expect(call.message).toContain('spend: $100')
      expect(call.message).toContain('conversions: 5')
    })

    it('should throttle alerts exceeding max per hour', async () => {
      const { logger } = await import('../../lib/logger.js')

      // Send 20 alerts (max allowed)
      for (let i = 0; i < 20; i++) {
        await service.send({
          userId: 'user-123',
          phone: '5511999999999',
          alertType: 'action_executed',
          severity: 'info',
          title: `Alert ${i}`,
          message: 'Test',
        })
      }

      expect(mockSendText).toHaveBeenCalledTimes(20)

      // 21st alert should be throttled
      await service.send({
        userId: 'user-123',
        phone: '5511999999999',
        alertType: 'action_executed',
        severity: 'info',
        title: 'Alert 21',
        message: 'This should be throttled',
      })

      expect(mockSendText).toHaveBeenCalledTimes(20) // Still 20
      expect(logger.warn).toHaveBeenCalledWith(
        { phone: '5511999999999' },
        'Alert throttled - max alerts per hour exceeded'
      )
    })

    it('should not throw when notification fails', async () => {
      mockSendText.mockRejectedValueOnce(new Error('API error'))

      // Should not throw
      await expect(
        service.send({
          userId: 'user-123',
          phone: '5511999999999',
          alertType: 'action_executed',
          severity: 'info',
          title: 'Test',
          message: 'Test',
        })
      ).resolves.not.toThrow()
    })
  })

  describe('notifyActionExecuted', () => {
    it('should format action notification correctly', async () => {
      await service.notifyActionExecuted({
        userId: 'user-123',
        phone: '5511999999999',
        campaignName: 'Health Supplement - US',
        actionType: 'blacklist',
        targetName: 'msn.com_widget_12345',
        reason: 'Spent $125.50 with 0 conversions',
      })

      const call = mockSendText.mock.calls[0][0]
      expect(call.message).toContain('*BLACKLIST: msn.com_widget_12345*')
      expect(call.message).toContain('Campaign: Health Supplement - US')
      expect(call.message).toContain('Spent $125.50 with 0 conversions')
    })
  })

  describe('notifyCriticalSpend', () => {
    it('should format critical spend notification correctly', async () => {
      await service.notifyCriticalSpend({
        userId: 'user-123',
        phone: '5511999999999',
        campaignName: 'Health Supplement - US',
        spend: 450,
        targetCpa: 100,
        conversions: 1,
      })

      const call = mockSendText.mock.calls[0][0]
      expect(call.message).toContain('🚨')
      expect(call.message).toContain('*BLEEDING: Health Supplement - US*')
      expect(call.message).toContain('4.5x CPA goal')
      expect(call.message).toContain('spend: $450.00')
    })
  })

  describe('notifyOptimizerError', () => {
    it('should format error notification correctly', async () => {
      await service.notifyOptimizerError({
        userId: 'user-123',
        phone: '5511999999999',
        campaignName: 'Test Campaign',
        error: '3 of 5 actions failed to execute',
      })

      const call = mockSendText.mock.calls[0][0]
      expect(call.message).toContain('⚠️')
      expect(call.message).toContain('*Optimizer Error: Test Campaign*')
      expect(call.message).toContain('3 of 5 actions failed to execute')
    })
  })

  describe('sendDailyReport', () => {
    it('should format daily report correctly', async () => {
      await service.sendDailyReport({
        userId: 'user-123',
        phone: '5511999999999',
        date: '2026-01-05',
        totalSpend: 1500,
        totalConversions: 15,
        actionsExecuted: 25,
        campaignsSynced: 10,
      })

      const call = mockSendText.mock.calls[0][0]
      expect(call.message).toContain('*Daily Report: 2026-01-05*')
      expect(call.message).toContain('Total Spend: $1500.00')
      expect(call.message).toContain('Avg CPA: $100.00')
      expect(call.message).toContain('Actions: 25')
    })
  })
})
