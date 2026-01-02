import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { sourceAccounts, campaignSyncs } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import {
  createTestClient,
  createTestApp,
  createAuthHeaders,
  seedSourceAccount,
} from '../test/helpers.js'
import { TEST_USER_ID, TEST_USER_ID_2 } from '../test/fixtures/index.js'

// TDD: These tests define expected behavior for campaigns route
// Routes should be implemented in src/routes/campaigns.ts

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

// Stub route for TDD - implement in routes/campaigns.ts
function createCampaignsRoutes() {
  return new Hono()
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

      // Get latest campaign syncs for user's accounts
      // Use a subquery to get the latest sync per campaign
      const campaigns = await db
        .select()
        .from(campaignSyncs)
        .where(
          sourceAccountId
            ? eq(campaignSyncs.sourceAccountId, sourceAccountId)
            : undefined as never
        )
        .orderBy(campaignSyncs.syncedAt)

      // Filter to user's accounts only
      const userCampaigns = campaigns.filter((c) => accountIds.includes(c.sourceAccountId))

      // Dedupe by externalCampaignId, keeping latest
      const latestByExternalId = new Map<string, typeof campaigns[0]>()
      for (const campaign of userCampaigns) {
        const key = `${campaign.sourceAccountId}:${campaign.externalCampaignId}`
        latestByExternalId.set(key, campaign)
      }

      return c.json({
        data: Array.from(latestByExternalId.values()).map((c) => ({
          id: c.id,
          sourceAccountId: c.sourceAccountId,
          externalCampaignId: c.externalCampaignId,
          name: c.campaignName,
          status: c.status,
          enabled: c.enabled,
          budget: c.budget,
          bid: c.bid,
          metrics: {
            spend: parseFloat(c.spend),
            impressions: c.impressions,
            clicks: c.clicks,
            conversions: c.conversions,
            ctr: parseFloat(c.ctr),
            cpa: parseFloat(c.cpa),
          },
          syncedAt: c.syncedAt,
        })),
      })
    })
    .get('/:sourceAccountId/:externalCampaignId', async (c) => {
      const user = c.get('user')
      const sourceAccountId = c.req.param('sourceAccountId')
      const externalCampaignId = c.req.param('externalCampaignId')

      // Verify user owns the source account
      const accounts = await db.select({ id: sourceAccounts.id })
        .from(sourceAccounts)
        .where(eq(sourceAccounts.userId, user.id))

      const accountIds = accounts.map((a) => a.id)
      if (!accountIds.includes(sourceAccountId)) {
        return c.json({ error: 'Campaign not found' }, 404)
      }

      // Get campaign syncs
      const syncs = await db.select()
        .from(campaignSyncs)
        .where(eq(campaignSyncs.sourceAccountId, sourceAccountId))
        .orderBy(campaignSyncs.syncedAt)

      const campaignSyncData = syncs.filter(
        (s) => s.externalCampaignId === externalCampaignId
      )

      if (campaignSyncData.length === 0) {
        return c.json({ error: 'Campaign not found' }, 404)
      }

      const latest = campaignSyncData[campaignSyncData.length - 1]

      return c.json({
        data: {
          id: latest.id,
          sourceAccountId: latest.sourceAccountId,
          externalCampaignId: latest.externalCampaignId,
          name: latest.campaignName,
          status: latest.status,
          enabled: latest.enabled,
          budget: latest.budget,
          bid: latest.bid,
          metrics: {
            spend: parseFloat(latest.spend),
            impressions: latest.impressions,
            clicks: latest.clicks,
            conversions: latest.conversions,
            ctr: parseFloat(latest.ctr),
            cpa: parseFloat(latest.cpa),
          },
          syncedAt: latest.syncedAt,
          history: campaignSyncData.map((s) => ({
            spend: parseFloat(s.spend),
            conversions: s.conversions,
            cpa: parseFloat(s.cpa),
            syncedAt: s.syncedAt,
          })),
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
