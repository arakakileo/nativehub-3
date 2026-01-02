import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CampaignSyncService } from './campaign-sync.js'
import { db } from '../lib/db.js'
import { sourceAccounts, campaignSyncs } from '../db/schema.js'
import { sourceAccountService } from './source-account.service.js'
import { eq } from 'drizzle-orm'
import { TEST_USER_ID } from '../test/fixtures/index.js'
import type { NormalizedCampaign } from '@nativehub/shared'

// Mock getAuthenticatedSource
vi.mock('../traffic-sources/index.js', () => ({
  getAuthenticatedSource: vi.fn(),
}))

import { getAuthenticatedSource } from '../traffic-sources/index.js'
const mockGetAuthenticatedSource = vi.mocked(getAuthenticatedSource)

// Helper to create mock campaigns
const createMockCampaign = (id: string, overrides: Partial<NormalizedCampaign> = {}): NormalizedCampaign => ({
  id,
  externalId: id,
  sourceId: 'revcontent',
  sourceAccountId: 'test-account',
  name: `Campaign ${id}`,
  status: 'active',
  enabled: true,
  budget: 100,
  bid: 0.5,
  metrics: {
    spend: 25,
    impressions: 10000,
    clicks: 150,
    conversions: 5,
    ctr: 1.5,
    cpa: 5.0,
    cpc: 0.17,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

describe('CampaignSyncService', () => {
  let syncService: CampaignSyncService
  let testAccountId: string

  beforeEach(async () => {
    vi.clearAllMocks()
    syncService = new CampaignSyncService()

    // Create a test source account
    const account = await sourceAccountService.create(TEST_USER_ID, {
      sourceId: 'revcontent',
      name: 'Sync Test Account',
      clientId: 'test-client',
      clientSecret: 'test-secret',
    })
    testAccountId = account.id

    // Mark account as active
    await db.update(sourceAccounts)
      .set({ status: 'active' })
      .where(eq(sourceAccounts.id, testAccountId))
  })

  describe('syncAccount', () => {
    it('should fetch and upsert campaigns from traffic source', async () => {
      const mockCampaigns = [
        createMockCampaign('camp-1'),
        createMockCampaign('camp-2', { name: 'Campaign 2', enabled: false }),
      ]

      mockGetAuthenticatedSource.mockResolvedValue({
        getCampaigns: vi.fn().mockResolvedValue(mockCampaigns),
      } as any)

      const count = await syncService.syncAccount(testAccountId)

      expect(count).toBe(2)
      expect(mockGetAuthenticatedSource).toHaveBeenCalledWith(testAccountId)

      // Verify campaigns are in database
      const synced = await db.select()
        .from(campaignSyncs)
        .where(eq(campaignSyncs.sourceAccountId, testAccountId))

      expect(synced).toHaveLength(2)
      expect(synced.map(c => c.externalCampaignId)).toContain('camp-1')
      expect(synced.map(c => c.externalCampaignId)).toContain('camp-2')
    })

    it('should update existing campaigns on subsequent syncs', async () => {
      // First sync
      const mockCampaigns = [
        createMockCampaign('camp-1', { name: 'Original Name' }),
      ]

      mockGetAuthenticatedSource.mockResolvedValue({
        getCampaigns: vi.fn().mockResolvedValue(mockCampaigns),
      } as any)

      await syncService.syncAccount(testAccountId)

      // Second sync with updated data
      const updatedCampaigns = [
        createMockCampaign('camp-1', {
          name: 'Updated Name',
          metrics: { ...createMockCampaign('camp-1').metrics, spend: 50 },
        }),
      ]

      mockGetAuthenticatedSource.mockResolvedValue({
        getCampaigns: vi.fn().mockResolvedValue(updatedCampaigns),
      } as any)

      await syncService.syncAccount(testAccountId)

      // Verify only one campaign exists (upserted, not duplicated)
      const synced = await db.select()
        .from(campaignSyncs)
        .where(eq(campaignSyncs.sourceAccountId, testAccountId))

      expect(synced).toHaveLength(1)
      expect(synced[0].campaignName).toBe('Updated Name')
      expect(synced[0].spend).toBe('50')
    })

    it('should update lastSyncAt on source account', async () => {
      mockGetAuthenticatedSource.mockResolvedValue({
        getCampaigns: vi.fn().mockResolvedValue([createMockCampaign('camp-1')]),
      } as any)

      const beforeSync = new Date()
      await syncService.syncAccount(testAccountId)
      const afterSync = new Date()

      const [account] = await db.select()
        .from(sourceAccounts)
        .where(eq(sourceAccounts.id, testAccountId))

      expect(account.lastSyncAt).toBeDefined()
      expect(account.lastSyncAt!.getTime()).toBeGreaterThanOrEqual(beforeSync.getTime())
      expect(account.lastSyncAt!.getTime()).toBeLessThanOrEqual(afterSync.getTime())
    })

    it('should clear lastError on successful sync', async () => {
      // Set an error first
      await db.update(sourceAccounts)
        .set({ lastError: 'Previous error' })
        .where(eq(sourceAccounts.id, testAccountId))

      mockGetAuthenticatedSource.mockResolvedValue({
        getCampaigns: vi.fn().mockResolvedValue([createMockCampaign('camp-1')]),
      } as any)

      await syncService.syncAccount(testAccountId)

      const [account] = await db.select()
        .from(sourceAccounts)
        .where(eq(sourceAccounts.id, testAccountId))

      expect(account.lastError).toBeNull()
    })

    it('should handle campaigns with unlimited budget', async () => {
      const mockCampaigns = [
        createMockCampaign('camp-1', { budget: 'unlimited' }),
      ]

      mockGetAuthenticatedSource.mockResolvedValue({
        getCampaigns: vi.fn().mockResolvedValue(mockCampaigns),
      } as any)

      await syncService.syncAccount(testAccountId)

      const [synced] = await db.select()
        .from(campaignSyncs)
        .where(eq(campaignSyncs.sourceAccountId, testAccountId))

      // Unlimited budget stored as null
      expect(synced.budget).toBeNull()
    })

    it('should throw error when traffic source fails', async () => {
      mockGetAuthenticatedSource.mockResolvedValue({
        getCampaigns: vi.fn().mockRejectedValue(new Error('API rate limited')),
      } as any)

      await expect(syncService.syncAccount(testAccountId))
        .rejects.toThrow('API rate limited')
    })
  })

  describe('syncAll', () => {
    it('should sync all active accounts', async () => {
      // Create second active account
      const account2 = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'taboola',
        name: 'Second Account',
        clientId: 'client-2',
      })
      await db.update(sourceAccounts)
        .set({ status: 'active' })
        .where(eq(sourceAccounts.id, account2.id))

      mockGetAuthenticatedSource.mockResolvedValue({
        getCampaigns: vi.fn().mockResolvedValue([createMockCampaign('camp-1')]),
      } as any)

      const result = await syncService.syncAll()

      expect(result.synced).toBe(2)
      expect(result.failed).toBe(0)
      expect(result.details).toHaveLength(2)
      expect(result.details.every(d => d.success)).toBe(true)
    })

    it('should skip non-active accounts', async () => {
      // Create pending account
      await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'taboola',
        name: 'Pending Account',
        clientId: 'client-pending',
      })
      // Default status is 'pending', so it won't be synced

      mockGetAuthenticatedSource.mockResolvedValue({
        getCampaigns: vi.fn().mockResolvedValue([createMockCampaign('camp-1')]),
      } as any)

      const result = await syncService.syncAll()

      // Only the active testAccountId should be synced
      expect(result.synced).toBe(1)
    })

    it('should continue syncing other accounts when one fails', async () => {
      // Create second active account
      const account2 = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'taboola',
        name: 'Second Account',
        clientId: 'client-2',
      })
      await db.update(sourceAccounts)
        .set({ status: 'active' })
        .where(eq(sourceAccounts.id, account2.id))

      // First call fails, second succeeds
      mockGetAuthenticatedSource
        .mockResolvedValueOnce({
          getCampaigns: vi.fn().mockRejectedValue(new Error('API error')),
        } as any)
        .mockResolvedValueOnce({
          getCampaigns: vi.fn().mockResolvedValue([createMockCampaign('camp-1')]),
        } as any)

      const result = await syncService.syncAll()

      expect(result.synced).toBe(1)
      expect(result.failed).toBe(1)
      expect(result.details.filter(d => d.success)).toHaveLength(1)
      expect(result.details.filter(d => !d.success)).toHaveLength(1)
    })

    it('should record error message on failed accounts', async () => {
      mockGetAuthenticatedSource.mockResolvedValue({
        getCampaigns: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      } as any)

      const result = await syncService.syncAll()

      expect(result.failed).toBe(1)
      expect(result.details[0].error).toBe('Connection timeout')

      // Verify error recorded in database
      const [account] = await db.select()
        .from(sourceAccounts)
        .where(eq(sourceAccounts.id, testAccountId))

      expect(account.lastError).toBe('Connection timeout')
    })

    it('should return empty result when no active accounts', async () => {
      // Set test account to pending
      await db.update(sourceAccounts)
        .set({ status: 'pending' })
        .where(eq(sourceAccounts.id, testAccountId))

      const result = await syncService.syncAll()

      expect(result.synced).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.details).toHaveLength(0)
    })
  })
})
