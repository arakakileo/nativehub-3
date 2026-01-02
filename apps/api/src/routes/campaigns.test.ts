import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { sourceAccounts, campaignSyncs } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import {
  createTestClient,
  createTestApp,
  createAuthHeaders,
  seedSourceAccount,
} from '../test/helpers.js'
import { TEST_USER_ID_2 } from '../test/fixtures/index.js'

/**
 * Helper to seed campaign sync data
 */
async function seedCampaignSync(overrides: {
  sourceAccountId: string
  externalCampaignId?: string
  campaignName?: string
  status?: string
  enabled?: boolean
  bid?: string
  spend?: string
  conversions?: number
} = { sourceAccountId: '' }) {
  const [sync] = await db.insert(campaignSyncs).values({
    sourceAccountId: overrides.sourceAccountId,
    externalCampaignId: overrides.externalCampaignId ?? 'campaign-123',
    campaignName: overrides.campaignName ?? 'Test Campaign',
    status: overrides.status ?? 'active',
    enabled: overrides.enabled ?? true,
    bid: overrides.bid ?? '0.50',
    spend: overrides.spend ?? '100.00',
    impressions: 10000,
    clicks: 200,
    conversions: overrides.conversions ?? 5,
    ctr: '2.00',
    cpa: '20.00',
  }).returning()

  return sync
}

// Stub routes for testing (without real authMiddleware)
function createCampaignsRoutes() {
  return new Hono()
    // List campaigns for user
    .get('/', async (c) => {
      const user = c.get('user')
      const sourceAccountId = c.req.query('sourceAccountId')

      // Get user's source accounts
      const accounts = await db.select({ id: sourceAccounts.id })
        .from(sourceAccounts)
        .where(eq(sourceAccounts.userId, user.id))

      if (accounts.length === 0) {
        return c.json({ data: [] })
      }

      const accountIds = accounts.map((a) => a.id)

      // Get latest syncs for each campaign
      const allSyncs = await db.select().from(campaignSyncs)
        .orderBy(desc(campaignSyncs.syncedAt))

      // Filter by user's accounts
      let filtered = allSyncs.filter((s) => accountIds.includes(s.sourceAccountId))

      // Apply sourceAccountId filter
      if (sourceAccountId) {
        filtered = filtered.filter((s) => s.sourceAccountId === sourceAccountId)
      }

      // Group by campaign to get latest
      const latestByCampaign = new Map<string, typeof filtered[0]>()
      for (const sync of filtered) {
        const key = `${sync.sourceAccountId}:${sync.externalCampaignId}`
        if (!latestByCampaign.has(key)) {
          latestByCampaign.set(key, sync)
        }
      }

      const campaigns = Array.from(latestByCampaign.values())

      return c.json({
        data: campaigns.map((s) => ({
          id: s.id,
          sourceAccountId: s.sourceAccountId,
          externalCampaignId: s.externalCampaignId,
          name: s.campaignName,
          status: s.status,
          enabled: s.enabled,
          metrics: {
            spend: parseFloat(s.spend ?? '0'),
            conversions: s.conversions ?? 0,
            impressions: s.impressions ?? 0,
            clicks: s.clicks ?? 0,
            ctr: parseFloat(s.ctr ?? '0'),
            cpa: parseFloat(s.cpa ?? '0'),
          },
          syncedAt: s.syncedAt,
        })),
      })
    })
    // Get single campaign with history
    .get('/:sourceAccountId/:externalCampaignId', async (c) => {
      const user = c.get('user')
      const sourceAccountId = c.req.param('sourceAccountId')
      const externalCampaignId = c.req.param('externalCampaignId')

      // Verify user owns the source account
      const accounts = await db.select({ id: sourceAccounts.id })
        .from(sourceAccounts)
        .where(and(
          eq(sourceAccounts.id, sourceAccountId),
          eq(sourceAccounts.userId, user.id)
        ))

      if (accounts.length === 0) {
        return c.json({ error: 'Campaign not found' }, 404)
      }

      // Get all syncs for this campaign
      const syncs = await db.select().from(campaignSyncs)
        .where(and(
          eq(campaignSyncs.sourceAccountId, sourceAccountId),
          eq(campaignSyncs.externalCampaignId, externalCampaignId)
        ))
        .orderBy(campaignSyncs.syncedAt)

      if (syncs.length === 0) {
        return c.json({ error: 'Campaign not found' }, 404)
      }

      const latest = syncs[syncs.length - 1]

      return c.json({
        data: {
          id: latest.id,
          sourceAccountId: latest.sourceAccountId,
          externalCampaignId: latest.externalCampaignId,
          name: latest.campaignName,
          status: latest.status,
          enabled: latest.enabled,
          metrics: {
            spend: parseFloat(latest.spend ?? '0'),
            conversions: latest.conversions ?? 0,
            impressions: latest.impressions ?? 0,
            clicks: latest.clicks ?? 0,
            ctr: parseFloat(latest.ctr ?? '0'),
            cpa: parseFloat(latest.cpa ?? '0'),
          },
          history: syncs.map((s) => ({
            spend: parseFloat(s.spend ?? '0'),
            conversions: s.conversions ?? 0,
            syncedAt: s.syncedAt,
          })),
          syncedAt: latest.syncedAt,
        },
      })
    })
}


describe('Campaigns Routes - Integration (TDD)', () => {
  let app: Hono
  let client: ReturnType<typeof createTestClient>

  beforeEach(() => {
    app = createTestApp()
    app.route('/api/v1/campaigns', createCampaignsRoutes())
    client = createTestClient(app)
  })

  describe('GET /api/v1/campaigns', () => {
    it('should return 401 without auth header', async () => {
      const res = await client.get('/api/v1/campaigns')
      expect(res.status).toBe(401)
    })

    it('should return empty array when user has no campaigns', async () => {
      const res = await client.get('/api/v1/campaigns', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toEqual([])
    })

    it('should list campaigns across all user source accounts', async () => {
      const account1 = await seedSourceAccount({ name: 'Account 1' })
      const account2 = await seedSourceAccount({ name: 'Account 2', sourceId: 'taboola' })

      await seedCampaignSync({
        sourceAccountId: account1.id,
        externalCampaignId: 'camp-1',
        campaignName: 'Campaign 1',
      })
      await seedCampaignSync({
        sourceAccountId: account2.id,
        externalCampaignId: 'camp-2',
        campaignName: 'Campaign 2',
      })

      const res = await client.get('/api/v1/campaigns', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(2)
      expect(json.data.map((c: { name: string }) => c.name).sort()).toEqual(['Campaign 1', 'Campaign 2'])
    })

    it('should filter campaigns by sourceAccountId', async () => {
      const account1 = await seedSourceAccount({ name: 'Account 1' })
      const account2 = await seedSourceAccount({ name: 'Account 2', sourceId: 'taboola' })

      await seedCampaignSync({
        sourceAccountId: account1.id,
        externalCampaignId: 'camp-1',
        campaignName: 'Campaign 1',
      })
      await seedCampaignSync({
        sourceAccountId: account2.id,
        externalCampaignId: 'camp-2',
        campaignName: 'Campaign 2',
      })

      const res = await client.get(`/api/v1/campaigns?sourceAccountId=${account1.id}`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].name).toBe('Campaign 1')
    })

    it('should include performance metrics', async () => {
      const account = await seedSourceAccount()
      await seedCampaignSync({
        sourceAccountId: account.id,
        spend: '150.50',
        conversions: 10,
      })

      const res = await client.get('/api/v1/campaigns', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data[0].metrics).toMatchObject({
        spend: 150.5,
        conversions: 10,
      })
    })

    it('should not include other user campaigns', async () => {
      const myAccount = await seedSourceAccount({ name: 'My Account' })
      const otherAccount = await seedSourceAccount({
        userId: TEST_USER_ID_2,
        name: 'Other Account',
      })

      await seedCampaignSync({
        sourceAccountId: myAccount.id,
        campaignName: 'My Campaign',
      })
      await seedCampaignSync({
        sourceAccountId: otherAccount.id,
        campaignName: 'Other Campaign',
      })

      const res = await client.get('/api/v1/campaigns', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].name).toBe('My Campaign')
    })

    it('should return latest sync for each campaign', async () => {
      const account = await seedSourceAccount()

      // Insert two syncs for same campaign
      await seedCampaignSync({
        sourceAccountId: account.id,
        externalCampaignId: 'camp-1',
        campaignName: 'Old Name',
        spend: '50.00',
      })

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10))

      await seedCampaignSync({
        sourceAccountId: account.id,
        externalCampaignId: 'camp-1',
        campaignName: 'New Name',
        spend: '100.00',
      })

      const res = await client.get('/api/v1/campaigns', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].name).toBe('New Name')
      expect(json.data[0].metrics.spend).toBe(100)
    })
  })

  describe('GET /api/v1/campaigns/:sourceAccountId/:externalCampaignId', () => {
    it('should return 404 for non-existent campaign', async () => {
      const account = await seedSourceAccount()

      const res = await client.get(`/api/v1/campaigns/${account.id}/non-existent`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(404)
    })

    it('should return 404 for other user campaign', async () => {
      const otherAccount = await seedSourceAccount({
        userId: TEST_USER_ID_2,
        name: 'Other Account',
      })
      await seedCampaignSync({
        sourceAccountId: otherAccount.id,
        externalCampaignId: 'camp-1',
      })

      const res = await client.get(`/api/v1/campaigns/${otherAccount.id}/camp-1`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(404)
    })

    it('should return campaign with metrics', async () => {
      const account = await seedSourceAccount()
      await seedCampaignSync({
        sourceAccountId: account.id,
        externalCampaignId: 'camp-1',
        campaignName: 'Test Campaign',
        spend: '200.00',
        conversions: 20,
      })

      const res = await client.get(`/api/v1/campaigns/${account.id}/camp-1`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.name).toBe('Test Campaign')
      expect(json.data.externalCampaignId).toBe('camp-1')
      expect(json.data.metrics.spend).toBe(200)
      expect(json.data.metrics.conversions).toBe(20)
    })

    it('should include performance history', async () => {
      const account = await seedSourceAccount()

      // Insert multiple syncs
      await seedCampaignSync({
        sourceAccountId: account.id,
        externalCampaignId: 'camp-1',
        spend: '50.00',
        conversions: 5,
      })
      await new Promise((resolve) => setTimeout(resolve, 10))
      await seedCampaignSync({
        sourceAccountId: account.id,
        externalCampaignId: 'camp-1',
        spend: '100.00',
        conversions: 10,
      })

      const res = await client.get(`/api/v1/campaigns/${account.id}/camp-1`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.history).toHaveLength(2)
      expect(json.data.history[0].spend).toBe(50)
      expect(json.data.history[1].spend).toBe(100)
    })
  })
})
