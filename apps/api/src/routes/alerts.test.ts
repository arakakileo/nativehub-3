/**
 * Alerts API Route Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'

// Mock dependencies before import
vi.mock('../lib/db.js', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
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
import { alertsRouter } from './alerts.js'
import { db } from '../lib/db.js'

describe('alertsRouter', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()

    // Create app with mock auth middleware
    app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as never, { id: 'test-user-id', email: 'test@example.com' })
      await next()
    })
    app.route('/alerts', alertsRouter)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('GET /alerts', () => {
    it('should return paginated alerts', async () => {
      // Mock count query
      const mockSelect = vi.fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 5 }]),
          }),
        })
        // Mock alerts query
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue([
                    { id: 'alert-1', title: 'Test Alert', severity: 'info' },
                    { id: 'alert-2', title: 'Test Alert 2', severity: 'warning' },
                  ]),
                }),
              }),
            }),
          }),
        })

      ;(db.select as ReturnType<typeof vi.fn>).mockImplementation(mockSelect)

      const res = await app.request('/alerts?page=1&limit=10')
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.alerts).toHaveLength(2)
      expect(data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 5,
        totalPages: 1,
        hasMore: false,
      })
    })

    it('should return 401 when not authenticated', async () => {
      // Create app without auth
      const appNoAuth = new Hono()
      appNoAuth.route('/alerts', alertsRouter)

      const res = await appNoAuth.request('/alerts')
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('GET /alerts/unread-count', () => {
    it('should return unread count', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 3 }]),
        }),
      })

      ;(db.select as ReturnType<typeof vi.fn>).mockImplementation(mockSelect)

      const res = await app.request('/alerts/unread-count')
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.count).toBe(3)
    })
  })

  describe('GET /alerts/:id', () => {
    it('should return single alert', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: 'alert-1', title: 'Test Alert', severity: 'info', userId: 'test-user-id' },
            ]),
          }),
        }),
      })

      ;(db.select as ReturnType<typeof vi.fn>).mockImplementation(mockSelect)

      const res = await app.request('/alerts/alert-1')
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.id).toBe('alert-1')
      expect(data.title).toBe('Test Alert')
    })

    it('should return 404 when alert not found', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      })

      ;(db.select as ReturnType<typeof vi.fn>).mockImplementation(mockSelect)

      const res = await app.request('/alerts/nonexistent')
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe('Alert not found')
    })
  })

  describe('PATCH /alerts/:id/acknowledge', () => {
    it('should acknowledge alert', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              { id: 'alert-1', acknowledged: true, acknowledgedAt: new Date() },
            ]),
          }),
        }),
      })

      ;(db.update as ReturnType<typeof vi.fn>).mockImplementation(mockUpdate)

      const res = await app.request('/alerts/alert-1/acknowledge', { method: 'PATCH' })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.acknowledged).toBe(true)
    })

    it('should return 404 when alert not found', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      })

      ;(db.update as ReturnType<typeof vi.fn>).mockImplementation(mockUpdate)

      const res = await app.request('/alerts/nonexistent/acknowledge', { method: 'PATCH' })
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe('Alert not found')
    })
  })

  describe('PATCH /alerts/acknowledge-all', () => {
    it('should acknowledge all unread alerts', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              { id: 'alert-1' },
              { id: 'alert-2' },
              { id: 'alert-3' },
            ]),
          }),
        }),
      })

      ;(db.update as ReturnType<typeof vi.fn>).mockImplementation(mockUpdate)

      const res = await app.request('/alerts/acknowledge-all', { method: 'PATCH' })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.acknowledged).toBe(3)
    })
  })
})
