/**
 * A/B Testing Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ABTestingService } from './ab-testing.service.js'

// Mock dependencies
vi.mock('../../lib/db.js', () => ({
  db: {
    select: vi.fn(),
  },
}))

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('ABTestingService', () => {
  let service: ABTestingService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ABTestingService()
  })

  describe('createExperiment', () => {
    it('should create experiment with valid variants', () => {
      const experiment = service.createExperiment({
        name: 'Test Experiment',
        description: 'Testing bid strategies',
        sourceAccountId: 'account-1',
        variants: [
          { name: 'Control', description: 'Default strategy', config: {}, weight: 50 },
          { name: 'Variant A', description: 'Aggressive bidding', config: { bidMultiplier: 1.2 }, weight: 50 },
        ],
      })

      expect(experiment.id).toBeDefined()
      expect(experiment.name).toBe('Test Experiment')
      expect(experiment.status).toBe('draft')
      expect(experiment.variants).toHaveLength(2)
      expect(experiment.variants[0].id).toBe('control')
      expect(experiment.variants[1].id).toBe('variant_1')
    })

    it('should throw if variant weights do not sum to 100', () => {
      expect(() => {
        service.createExperiment({
          name: 'Test Experiment',
          description: 'Testing',
          sourceAccountId: 'account-1',
          variants: [
            { name: 'Control', description: 'Default', config: {}, weight: 40 },
            { name: 'Variant A', description: 'Test', config: {}, weight: 40 },
          ],
        })
      }).toThrow('Variant weights must sum to 100')
    })
  })

  describe('startExperiment', () => {
    it('should assign campaigns to variants', async () => {
      const { db } = await import('../../lib/db.js')

      // Create experiment first
      const experiment = service.createExperiment({
        name: 'Test Experiment',
        description: 'Testing',
        sourceAccountId: 'account-1',
        variants: [
          { name: 'Control', description: 'Default', config: {}, weight: 50 },
          { name: 'Variant A', description: 'Test', config: {}, weight: 50 },
        ],
      })

      // Mock campaigns
      const mockCampaigns = [
        { id: '1', externalCampaignId: 'camp-1' },
        { id: '2', externalCampaignId: 'camp-2' },
        { id: '3', externalCampaignId: 'camp-3' },
        { id: '4', externalCampaignId: 'camp-4' },
      ]

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockCampaigns),
        }),
      })

      const started = await service.startExperiment(experiment.id)

      expect(started.status).toBe('running')
      expect(started.startedAt).toBeDefined()
      expect(started.campaignAssignments.size).toBe(4)
    })

    it('should throw for non-existent experiment', async () => {
      await expect(service.startExperiment('non-existent')).rejects.toThrow('not found')
    })

    it('should throw if experiment already running', async () => {
      const { db } = await import('../../lib/db.js')

      const experiment = service.createExperiment({
        name: 'Test Experiment',
        description: 'Testing',
        sourceAccountId: 'account-1',
        variants: [
          { name: 'Control', description: 'Default', config: {}, weight: 50 },
          { name: 'Variant A', description: 'Test', config: {}, weight: 50 },
        ],
      })

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })

      await service.startExperiment(experiment.id)

      // Try to start again
      await expect(service.startExperiment(experiment.id)).rejects.toThrow('Cannot start experiment in running status')
    })
  })

  describe('getVariantConfig', () => {
    it('should return variant config for assigned campaign', async () => {
      const { db } = await import('../../lib/db.js')

      const experiment = service.createExperiment({
        name: 'Test Experiment',
        description: 'Testing',
        sourceAccountId: 'account-1',
        variants: [
          { name: 'Control', description: 'Default', config: { strategy: 'default' }, weight: 100 },
        ],
      })

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: '1', externalCampaignId: 'camp-1' }]),
        }),
      })

      await service.startExperiment(experiment.id)

      const config = service.getVariantConfig(experiment.id, 'camp-1')
      expect(config).toEqual({ strategy: 'default' })
    })

    it('should return null for non-running experiment', () => {
      const experiment = service.createExperiment({
        name: 'Test Experiment',
        description: 'Testing',
        sourceAccountId: 'account-1',
        variants: [
          { name: 'Control', description: 'Default', config: {}, weight: 100 },
        ],
      })

      const config = service.getVariantConfig(experiment.id, 'camp-1')
      expect(config).toBeNull()
    })
  })

  describe('stopExperiment', () => {
    it('should stop running experiment', async () => {
      const { db } = await import('../../lib/db.js')

      const experiment = service.createExperiment({
        name: 'Test Experiment',
        description: 'Testing',
        sourceAccountId: 'account-1',
        variants: [
          { name: 'Control', description: 'Default', config: {}, weight: 100 },
        ],
      })

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })

      await service.startExperiment(experiment.id)

      const stopped = service.stopExperiment(experiment.id)
      expect(stopped.status).toBe('completed')
      expect(stopped.endedAt).toBeDefined()
    })
  })

  describe('pauseExperiment', () => {
    it('should pause running experiment', async () => {
      const { db } = await import('../../lib/db.js')

      const experiment = service.createExperiment({
        name: 'Test Experiment',
        description: 'Testing',
        sourceAccountId: 'account-1',
        variants: [
          { name: 'Control', description: 'Default', config: {}, weight: 100 },
        ],
      })

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })

      await service.startExperiment(experiment.id)

      const paused = service.pauseExperiment(experiment.id)
      expect(paused.status).toBe('paused')
    })

    it('should throw if experiment not running', () => {
      const experiment = service.createExperiment({
        name: 'Test Experiment',
        description: 'Testing',
        sourceAccountId: 'account-1',
        variants: [
          { name: 'Control', description: 'Default', config: {}, weight: 100 },
        ],
      })

      expect(() => service.pauseExperiment(experiment.id)).toThrow('Cannot pause experiment in draft status')
    })
  })

  describe('listExperiments', () => {
    it('should list experiments for source account', () => {
      service.createExperiment({
        name: 'Experiment 1',
        description: 'Testing',
        sourceAccountId: 'account-1',
        variants: [{ name: 'Control', description: 'Default', config: {}, weight: 100 }],
      })

      service.createExperiment({
        name: 'Experiment 2',
        description: 'Testing',
        sourceAccountId: 'account-1',
        variants: [{ name: 'Control', description: 'Default', config: {}, weight: 100 }],
      })

      service.createExperiment({
        name: 'Experiment 3',
        description: 'Testing',
        sourceAccountId: 'account-2', // Different account
        variants: [{ name: 'Control', description: 'Default', config: {}, weight: 100 }],
      })

      const experiments = service.listExperiments('account-1')
      expect(experiments).toHaveLength(2)
    })
  })

  describe('deleteExperiment', () => {
    it('should delete draft experiment', () => {
      const experiment = service.createExperiment({
        name: 'Test Experiment',
        description: 'Testing',
        sourceAccountId: 'account-1',
        variants: [{ name: 'Control', description: 'Default', config: {}, weight: 100 }],
      })

      const result = service.deleteExperiment(experiment.id)
      expect(result).toBe(true)
      expect(service.getExperiment(experiment.id)).toBeNull()
    })

    it('should throw for running experiment', async () => {
      const { db } = await import('../../lib/db.js')

      const experiment = service.createExperiment({
        name: 'Test Experiment',
        description: 'Testing',
        sourceAccountId: 'account-1',
        variants: [{ name: 'Control', description: 'Default', config: {}, weight: 100 }],
      })

      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })

      await service.startExperiment(experiment.id)

      expect(() => service.deleteExperiment(experiment.id)).toThrow('Cannot delete running experiment')
    })
  })
})
