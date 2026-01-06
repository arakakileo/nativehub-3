/**
 * Daily Report Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before import
vi.mock('../../lib/db.js', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}))

vi.mock('../notification/index.js', () => ({
  notificationService: {
    sendDailyReport: vi.fn().mockResolvedValue(undefined),
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
import { DailyReportService } from './daily-report.service.js'
import { db } from '../../lib/db.js'
import { notificationService } from '../notification/index.js'

describe('DailyReportService', () => {
  let service: DailyReportService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new DailyReportService()
  })

  describe('generateAndSendReports', () => {
    it('should return empty results when no users have phone configured', async () => {
      // Mock empty user list
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })
      ;(db.select as ReturnType<typeof vi.fn>).mockImplementation(mockSelect)

      const result = await service.generateAndSendReports()

      expect(result.processed).toBe(0)
      expect(result.sent).toBe(0)
      expect(result.skipped).toBe(0)
      expect(result.errors).toBe(0)
    })

    it('should skip users without activity', async () => {
      // Mock user with phone
      const mockSelectUsers = vi.fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { id: 'user-1', phone: '5511999999999', notificationsEnabled: true },
            ]),
          }),
        })
        // Mock source accounts query
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        })

      ;(db.select as ReturnType<typeof vi.fn>).mockImplementation(mockSelectUsers)

      const result = await service.generateAndSendReports()

      expect(result.processed).toBe(1)
      expect(result.skipped).toBe(1)
      expect(result.sent).toBe(0)
      expect(notificationService.sendDailyReport).not.toHaveBeenCalled()
    })
  })

  describe('aggregateUserStats', () => {
    it('should return zero stats when user has no source accounts', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })
      ;(db.select as ReturnType<typeof vi.fn>).mockImplementation(mockSelect)

      const stats = await service.aggregateUserStats(
        'user-1',
        new Date('2026-01-01'),
        new Date('2026-01-02')
      )

      expect(stats.totalSpend).toBe(0)
      expect(stats.totalConversions).toBe(0)
      expect(stats.actionsExecuted).toBe(0)
      expect(stats.campaignsSynced).toBe(0)
    })
  })

  describe('getUserReportStats', () => {
    it('should return stats for requested number of days', async () => {
      // Mock all queries to return empty/zero values
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })
      ;(db.select as ReturnType<typeof vi.fn>).mockImplementation(mockSelect)

      const stats = await service.getUserReportStats('user-1', 3)

      expect(stats).toHaveLength(3)
      expect(stats[0]).toHaveProperty('date')
      expect(stats[0]).toHaveProperty('totalSpend')
      expect(stats[0]).toHaveProperty('totalConversions')
      expect(stats[0]).toHaveProperty('actionsExecuted')
      expect(stats[0]).toHaveProperty('campaignsSynced')
    })
  })
})
