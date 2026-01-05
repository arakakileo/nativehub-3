import { Hono } from 'hono'
import { eq, and, inArray, gte, lte, asc, desc, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../lib/db.js'
import { sourceAccounts, campaignSyncs } from '../db/schema.js'

// Query params schema for listing campaigns
const ListCampaignsQuerySchema = z.object({
  sourceAccountId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['active', 'paused', 'deleted', 'all']).optional().default('all'),
  sortBy: z.enum(['name', 'spend', 'conversions', 'clicks', 'cpc']).optional().default('spend'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

// Note: sessionMiddleware is applied globally in index.ts for all /api/v1/* routes
export const campaignRoutes = new Hono()
  // List all campaigns with filtering and sorting
  .get('/', async (c) => {
    const userId = c.get('userId')

    // Parse and validate query params
    const parseResult = ListCampaignsQuerySchema.safeParse({
      sourceAccountId: c.req.query('sourceAccountId'),
      from: c.req.query('from'),
      to: c.req.query('to'),
      status: c.req.query('status'),
      sortBy: c.req.query('sortBy'),
      sortOrder: c.req.query('sortOrder'),
    })

    if (!parseResult.success) {
      return c.json({ error: 'Invalid query parameters', details: parseResult.error.errors }, 400)
    }

    const query = parseResult.data

    // Get user's source accounts
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    if (accounts.length === 0) {
      return c.json({ data: [] })
    }

    const accountIds = accounts.map((a) => a.id)

    // Build query conditions
    const conditions = []

    // Filter by source account (either specific or all user's accounts)
    if (query.sourceAccountId) {
      // Verify user owns this account
      if (!accountIds.includes(query.sourceAccountId)) {
        return c.json({ error: 'Source account not found' }, 404)
      }
      conditions.push(eq(campaignSyncs.sourceAccountId, query.sourceAccountId))
    } else {
      conditions.push(inArray(campaignSyncs.sourceAccountId, accountIds))
    }

    // Status filter
    if (query.status !== 'all') {
      conditions.push(eq(campaignSyncs.status, query.status))
    }

    // Date filter (filter by syncedAt)
    if (query.from) {
      conditions.push(gte(campaignSyncs.syncedAt, new Date(query.from)))
    }
    if (query.to) {
      conditions.push(lte(campaignSyncs.syncedAt, new Date(query.to + 'T23:59:59Z')))
    }

    // Determine sort column
    const getSortColumn = (sortBy: string) => {
      switch (sortBy) {
        case 'name':
          return campaignSyncs.campaignName
        case 'spend':
          return sql`CAST(${campaignSyncs.spend} AS DECIMAL)`
        case 'conversions':
          return campaignSyncs.conversions
        case 'clicks':
          return campaignSyncs.clicks
        case 'cpc':
          // CPC = spend / clicks, sort by spend as approximation for DB level
          return sql`CAST(${campaignSyncs.spend} AS DECIMAL)`
        default:
          return sql`CAST(${campaignSyncs.spend} AS DECIMAL)`
      }
    }

    const sortColumn = getSortColumn(query.sortBy)
    const orderFn = query.sortOrder === 'desc' ? desc : asc

    // Execute query
    const campaigns = await db
      .select()
      .from(campaignSyncs)
      .where(and(...conditions))
      .orderBy(orderFn(sortColumn))

    // Dedupe by externalCampaignId, keeping latest (already sorted)
    const latestByExternalId = new Map<string, typeof campaigns[0]>()
    for (const campaign of campaigns) {
      const key = `${campaign.sourceAccountId}:${campaign.externalCampaignId}`
      // Keep only the first occurrence (since we've already sorted)
      if (!latestByExternalId.has(key)) {
        latestByExternalId.set(key, campaign)
      }
    }

    // Convert to array and compute CPC
    let results = Array.from(latestByExternalId.values()).map((c) => {
      const spend = parseFloat(c.spend)
      const clicks = c.clicks
      const cpc = clicks > 0 ? spend / clicks : 0

      return {
        id: c.id,
        sourceAccountId: c.sourceAccountId,
        externalCampaignId: c.externalCampaignId,
        name: c.campaignName,
        status: c.status,
        enabled: c.enabled,
        budget: c.budget,
        bid: c.bid,
        spend,
        impressions: c.impressions,
        clicks,
        conversions: c.conversions,
        ctr: parseFloat(c.ctr),
        cpc,
        cpa: parseFloat(c.cpa),
        syncedAt: c.syncedAt,
      }
    })

    // Sort by CPC if requested (needs to be done in memory after computing CPC)
    if (query.sortBy === 'cpc') {
      results.sort((a, b) => {
        const diff = a.cpc - b.cpc
        return query.sortOrder === 'desc' ? -diff : diff
      })
    }

    return c.json({ data: results })
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
      .where(
        and(
          eq(campaignSyncs.sourceAccountId, sourceAccountId),
          eq(campaignSyncs.externalCampaignId, externalCampaignId)
        )
      )
      .orderBy(asc(campaignSyncs.syncedAt))

    if (syncs.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404)
    }

    const latest = syncs[syncs.length - 1]
    const spend = parseFloat(latest.spend)
    const clicks = latest.clicks
    const cpc = clicks > 0 ? spend / clicks : 0

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
        spend,
        impressions: latest.impressions,
        clicks,
        conversions: latest.conversions,
        ctr: parseFloat(latest.ctr),
        cpc,
        cpa: parseFloat(latest.cpa),
        syncedAt: latest.syncedAt,
        history: syncs.map((s) => ({
          spend: parseFloat(s.spend),
          conversions: s.conversions,
          cpa: parseFloat(s.cpa),
          syncedAt: s.syncedAt,
        })),
      },
    })
  })
