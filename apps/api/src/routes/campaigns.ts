import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../lib/db.js'
import { sourceAccounts, campaignSyncs } from '../db/schema.js'

// Note: sessionMiddleware is applied globally in index.ts for all /api/v1/* routes
export const campaignRoutes = new Hono()
  // List all campaigns
  .get('/', async (c) => {
    const userId = c.get('userId')
    const sourceAccountId = c.req.query('sourceAccountId')

    // Get user's source accounts
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    if (accounts.length === 0) {
      return c.json({ data: [] })
    }

    const accountIds = accounts.map((a) => a.id)

    // Get latest campaign syncs for user's accounts
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

  // Get single campaign with history
  .get('/:sourceAccountId/:externalCampaignId', async (c) => {
    const userId = c.get('userId')
    const sourceAccountId = c.req.param('sourceAccountId')
    const externalCampaignId = c.req.param('externalCampaignId')

    // Verify user owns the source account
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

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
