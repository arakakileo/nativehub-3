import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// Mock pg-boss
vi.mock('../jobs/index.js', () => ({
  triggerJob: vi.fn().mockResolvedValue('test-job-id'),
  getJobStatus: vi.fn(),
  boss: {
    getQueueSize: vi.fn().mockResolvedValue(0),
    getSchedules: vi.fn().mockResolvedValue([]),
  },
}))

import { jobRoutes } from './jobs.js'
import { triggerJob, getJobStatus, boss } from '../jobs/index.js'

const mockTriggerJob = vi.mocked(triggerJob)
const mockGetJobStatus = vi.mocked(getJobStatus)
const mockBoss = vi.mocked(boss)

describe('Job Routes', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()

    // Create test app with job routes
    app = new Hono().route('/jobs', jobRoutes)
  })

  describe('GET /jobs/optimizer/status', () => {
    it('should return optimizer status when scheduler is active', async () => {
      mockBoss.getQueueSize
        .mockResolvedValueOnce(3) // pending
        .mockResolvedValueOnce(1) // active

      mockBoss.getSchedules.mockResolvedValue([
        { name: 'run-optimizer', cron: '0 * * * *', timezone: 'UTC' },
      ] as never)

      const response = await app.request('/jobs/optimizer/status')

      expect(response.status).toBe(200)

      const data = await response.json() as {
        status: string
        scheduler: { active: boolean; cron: string; timezone: string }
        queue: { pending: number; active: number }
      }
      expect(data.status).toBe('ok')
      expect(data.scheduler.active).toBe(true)
      expect(data.scheduler.cron).toBe('0 * * * *')
      expect(data.scheduler.timezone).toBe('UTC')
      expect(data.queue.pending).toBe(3)
      expect(data.queue.active).toBe(1)
    })

    it('should return inactive scheduler when no schedule exists', async () => {
      mockBoss.getQueueSize.mockResolvedValue(0)
      mockBoss.getSchedules.mockResolvedValue([])

      const response = await app.request('/jobs/optimizer/status')

      expect(response.status).toBe(200)

      const data = await response.json() as {
        status: string
        scheduler: { active: boolean; cron: null; timezone: null }
        queue: { pending: number; active: number }
      }
      expect(data.scheduler.active).toBe(false)
      expect(data.scheduler.cron).toBeNull()
      expect(data.queue.pending).toBe(0)
    })

    it('should handle errors gracefully', async () => {
      mockBoss.getQueueSize.mockRejectedValue(new Error('Database error'))

      const response = await app.request('/jobs/optimizer/status')

      expect(response.status).toBe(500)

      const data = await response.json() as { status: string; error: string }
      expect(data.status).toBe('error')
      expect(data.error).toBe('Database error')
    })
  })

  describe('POST /jobs/trigger', () => {
    it('should trigger sync-campaigns job', async () => {
      const response = await app.request('/jobs/trigger', {
        method: 'POST',
        body: JSON.stringify({ jobName: 'sync-campaigns' }),
        headers: { 'Content-Type': 'application/json' },
      })

      expect(response.status).toBe(202)

      const data = await response.json() as { jobId: string; jobName: string; status: string }
      expect(data.jobId).toBe('test-job-id')
      expect(data.jobName).toBe('sync-campaigns')
      expect(data.status).toBe('queued')
      expect(mockTriggerJob).toHaveBeenCalledWith('sync-campaigns')
    })

    it('should trigger run-optimizer job', async () => {
      const response = await app.request('/jobs/trigger', {
        method: 'POST',
        body: JSON.stringify({ jobName: 'run-optimizer' }),
        headers: { 'Content-Type': 'application/json' },
      })

      expect(response.status).toBe(202)

      const data = await response.json() as { jobId: string; jobName: string; status: string }
      expect(data.jobName).toBe('run-optimizer')
      expect(mockTriggerJob).toHaveBeenCalledWith('run-optimizer')
    })

    it('should reject invalid job names', async () => {
      const response = await app.request('/jobs/trigger', {
        method: 'POST',
        body: JSON.stringify({ jobName: 'invalid-job' }),
        headers: { 'Content-Type': 'application/json' },
      })

      expect(response.status).toBe(400)
      expect(mockTriggerJob).not.toHaveBeenCalled()
    })

    it('should reject missing jobName', async () => {
      const response = await app.request('/jobs/trigger', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })

      expect(response.status).toBe(400)
    })
  })

  describe('GET /jobs/:queue/:jobId', () => {
    it('should return job status for valid queue and jobId', async () => {
      mockGetJobStatus.mockResolvedValue({
        id: 'job-123',
        name: 'sync-campaigns',
        state: 'completed',
        createdOn: new Date('2024-01-01T00:00:00Z'),
        startedOn: new Date('2024-01-01T00:00:01Z'),
        completedOn: new Date('2024-01-01T00:00:10Z'),
        output: { success: true },
        retryCount: 0,
      })

      const response = await app.request('/jobs/sync-campaigns/job-123')

      expect(response.status).toBe(200)

      const data = await response.json() as {
        id: string
        name: string
        state: string
        output: { success: boolean }
        retryCount: number
      }
      expect(data.id).toBe('job-123')
      expect(data.name).toBe('sync-campaigns')
      expect(data.state).toBe('completed')
      expect(data.output).toEqual({ success: true })
      expect(mockGetJobStatus).toHaveBeenCalledWith('sync-campaigns', 'job-123')
    })

    it('should return 404 for non-existent job', async () => {
      mockGetJobStatus.mockResolvedValue(null)

      const response = await app.request('/jobs/sync-campaigns/non-existent')

      expect(response.status).toBe(404)

      const data = await response.json() as { error: string }
      expect(data.error).toBe('Job not found')
    })

    it('should return 400 for invalid queue name', async () => {
      const response = await app.request('/jobs/invalid-queue/job-123')

      expect(response.status).toBe(400)

      const data = await response.json() as { error: string }
      expect(data.error).toBe('Invalid queue name')
      expect(mockGetJobStatus).not.toHaveBeenCalled()
    })

    it('should work with run-optimizer queue', async () => {
      mockGetJobStatus.mockResolvedValue({
        id: 'opt-123',
        name: 'run-optimizer',
        state: 'active',
        createdOn: new Date(),
        startedOn: new Date(),
        completedOn: null,
        output: null,
        retryCount: 0,
      })

      const response = await app.request('/jobs/run-optimizer/opt-123')

      expect(response.status).toBe(200)

      const data = await response.json() as { name: string; state: string }
      expect(data.name).toBe('run-optimizer')
      expect(data.state).toBe('active')
    })
  })
})
