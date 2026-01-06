/**
 * Reports API Route Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'

// Mock dependencies before import
vi.mock('../lib/db.js', () => ({
  db: {
    select: vi.fn(),
  },
}))

vi.mock('../services/report/index.js', () => ({
  dailyReportService: {
    getUserReportStats: vi.fn(),
    generateAndSendReports: vi.fn(),
  },
}))

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import after mocks
import { reportsRouter } from './reports.js'
import { db } from '../lib/db.js'
import { dailyReportService } from '../services/report/index.js'

describe('reportsRouter', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()

    // Create app with mock auth middleware
    app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as never, { id: 'test-user-id', email: 'test@example.com' })
      await next()
    })
    app.route('/reports', reportsRouter)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('GET /reports/daily', () => {
    it('should return daily stats', async () => {
      const mockStats = [
        { date: '2026-01-04', totalSpend: 100, totalConversions: 5, actionsExecuted: 10, campaignsSynced: 3 },
        { date: '2026-01-03', totalSpend: 150, totalConversions: 8, actionsExecuted: 15, campaignsSynced: 3 },
      ]

      ;(dailyReportService.getUserReportStats as ReturnType<typeof vi.fn>).mockResolvedValue(mockStats)

      const res = await app.request('/reports/daily?days=2')
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.days).toHaveLength(2)
      expect(dailyReportService.getUserReportStats).toHaveBeenCalledWith('test-user-id', 2)
    })

    it('should default to 7 days', async () => {
      ;(dailyReportService.getUserReportStats as ReturnType<typeof vi.fn>).mockResolvedValue([])

      await app.request('/reports/daily')

      expect(dailyReportService.getUserReportStats).toHaveBeenCalledWith('test-user-id', 7)
    })

    it('should cap at 30 days', async () => {
      ;(dailyReportService.getUserReportStats as ReturnType<typeof vi.fn>).mockResolvedValue([])

      await app.request('/reports/daily?days=100')

      expect(dailyReportService.getUserReportStats).toHaveBeenCalledWith('test-user-id', 30)
    })
  })

  describe('GET /reports/summary', () => {
    it('should return summary when user has no accounts', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })

      ;(db.select as ReturnType<typeof vi.fn>).mockImplementation(mockSelect)

      const res = await app.request('/reports/summary')
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.totalSpend).toBe(0)
      expect(data.totalConversions).toBe(0)
      expect(data.totalActions).toBe(0)
    })

    it('should return 401 when not authenticated', async () => {
      const appNoAuth = new Hono()
      appNoAuth.route('/reports', reportsRouter)

      const res = await appNoAuth.request('/reports/summary')
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('POST /reports/trigger', () => {
    it('should trigger daily report generation', async () => {
      const mockResult = { processed: 5, sent: 3, skipped: 2, errors: 0 }
      ;(dailyReportService.generateAndSendReports as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult)

      const res = await app.request('/reports/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toEqual(mockResult)
      expect(dailyReportService.generateAndSendReports).toHaveBeenCalled()
    })

    it('should accept custom date', async () => {
      const mockResult = { processed: 1, sent: 1, skipped: 0, errors: 0 }
      ;(dailyReportService.generateAndSendReports as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult)

      await app.request('/reports/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: '2026-01-01' }),
      })

      expect(dailyReportService.generateAndSendReports).toHaveBeenCalledWith(expect.any(Date))
    })
  })

  describe('GET /reports/actions', () => {
    it('should return empty when user has no accounts', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })

      ;(db.select as ReturnType<typeof vi.fn>).mockImplementation(mockSelect)

      const res = await app.request('/reports/actions')
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.actions).toEqual([])
      expect(data.pagination.total).toBe(0)
    })
  })
})
