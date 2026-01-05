import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PgBoss from 'pg-boss'

// Mock pg-boss
vi.mock('pg-boss', () => {
  const mockBoss = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    work: vi.fn().mockResolvedValue('worker-id'),
    schedule: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue('test-job-id'),
    createQueue: vi.fn().mockResolvedValue(undefined),
    getJobById: vi.fn().mockResolvedValue({
      id: 'test-job-id',
      name: 'sync-campaigns',
      state: 'completed',
      createdOn: new Date(),
      startedOn: new Date(),
      completedOn: new Date(),
      output: { success: true },
      retryCount: 0,
    }),
  }
  return {
    default: vi.fn(() => mockBoss),
  }
})

// Mock services
vi.mock('../services/campaign-sync.js', () => ({
  campaignSyncService: {
    syncAll: vi.fn().mockResolvedValue({ synced: 5, failed: 0 }),
  },
}))

vi.mock('../services/optimizer/index.js', () => ({
  optimizerService: {
    optimizeAll: vi.fn().mockResolvedValue({ optimized: 3 }),
  },
}))

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('Job Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('should initialize and register job handlers', async () => {
    const { initJobQueue, boss } = await import('./job-queue.js')
    await initJobQueue()

    expect(boss.start).toHaveBeenCalled()
    expect(boss.work).toHaveBeenCalledTimes(2)
    expect(boss.schedule).toHaveBeenCalledTimes(2)
  })

  it('should schedule sync-campaigns every 30 minutes', async () => {
    const { initJobQueue, boss } = await import('./job-queue.js')
    await initJobQueue()

    expect(boss.schedule).toHaveBeenCalledWith(
      'sync-campaigns',
      '*/30 * * * *',
      {},
      { tz: 'UTC' }
    )
  })

  it('should schedule run-optimizer every hour', async () => {
    const { initJobQueue, boss } = await import('./job-queue.js')
    await initJobQueue()

    expect(boss.schedule).toHaveBeenCalledWith(
      'run-optimizer',
      '0 * * * *',
      {},
      { tz: 'UTC' }
    )
  })

  it('should trigger manual job', async () => {
    const { triggerJob, boss } = await import('./job-queue.js')
    const jobId = await triggerJob('sync-campaigns')

    expect(boss.send).toHaveBeenCalledWith(
      'sync-campaigns',
      {},
      expect.objectContaining({
        retryLimit: 5,
        retryDelay: 30,
        retryBackoff: true,
      })
    )
    expect(jobId).toBe('test-job-id')
  })

  it('should get job status by queue and id', async () => {
    const { getJobStatus, boss } = await import('./job-queue.js')
    const job = await getJobStatus('sync-campaigns', 'test-job-id')

    expect(boss.getJobById).toHaveBeenCalledWith('sync-campaigns', 'test-job-id')
    expect(job).toHaveProperty('id', 'test-job-id')
    expect(job).toHaveProperty('state', 'completed')
  })

  it('should stop job queue gracefully', async () => {
    const { stopJobQueue, boss } = await import('./job-queue.js')
    await stopJobQueue()

    expect(boss.stop).toHaveBeenCalledWith({
      graceful: true,
      timeout: 30000,
    })
  })
})
