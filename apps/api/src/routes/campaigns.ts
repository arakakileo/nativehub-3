import { Hono } from 'hono'
import { eq, and, inArray, asc, desc, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../lib/db.js'
import { sourceAccounts, campaignSyncs } from '../db/schema.js'
import { getAuthenticatedSource } from '../traffic-sources/index.js'
import { logger } from '../lib/logger.js'

// Query params schema for listing campaigns
const ListCampaignsQuerySchema = z.object({
  sourceAccountId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['active', 'paused', 'deleted', 'all']).optional().default('all'),
  sortBy: z.enum(['name', 'spend', 'conversions', 'clicks', 'cpc']).optional().default('spend'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

// Campaign result type for API response
interface CampaignResult {
  id: string
  sourceAccountId: string
  externalCampaignId: string
  name: string
  status: string
  enabled: boolean
  budget: string | null
  bid: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpc: number
  cpa: number
  syncedAt: Date | string
}

// Sort campaigns by field
function sortCampaigns(
  campaigns: CampaignResult[],
  sortBy: string = 'spend',
  sortOrder: string = 'desc'
): CampaignResult[] {
  const multiplier = sortOrder === 'desc' ? -1 : 1
  return [...campaigns].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return multiplier * a.name.localeCompare(b.name)
      case 'spend':
        return multiplier * (a.spend - b.spend)
      case 'clicks':
        return multiplier * (a.clicks - b.clicks)
      case 'conversions':
        return multiplier * (a.conversions - b.conversions)
      case 'cpc':
        return multiplier * (a.cpc - b.cpc)
      default:
        return multiplier * (a.spend - b.spend)
    }
  })
}

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

    // Get user's source accounts (full data for API fetch path)
    const accounts = await db.select()
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    if (accounts.length === 0) {
      return c.json({ data: [] })
    }

    const accountIds = accounts.map((a) => a.id)

    // Validate sourceAccountId if provided
    if (query.sourceAccountId && !accountIds.includes(query.sourceAccountId)) {
      return c.json({ error: 'Source account not found' }, 404)
    }

    // BRANCH: Date filter provided = fetch from traffic source API
    if (query.from && query.to) {
      const results: CampaignResult[] = []
      const warnings: string[] = []

      // Filter to active/connected accounts
      const activeAccounts = accounts.filter(
        (a) => a.status === 'connected' || a.status === 'active'
      )

      // Filter by sourceAccountId if provided
      const targetAccounts = query.sourceAccountId
        ? activeAccounts.filter((a) => a.id === query.sourceAccountId)
        : activeAccounts

      logger.info({ from: query.from, to: query.to, accountCount: targetAccounts.length }, 'Fetching campaigns from API with date filter')

      // Fetch from each account in parallel
      await Promise.all(
        targetAccounts.map(async (account) => {
          try {
            const source = await getAuthenticatedSource(account.id)

            // getCampaigns internally calls getAllCampaignStatistics(from, to)
            const campaigns = await source.getCampaigns({
              from: query.from,
              to: query.to,
            })

            // Filter by status if not 'all'
            const filteredCampaigns = query.status === 'all'
              ? campaigns
              : campaigns.filter((c) => c.status === query.status)

            // Map to response format
            for (const campaign of filteredCampaigns) {
              results.push({
                id: campaign.id,
                sourceAccountId: account.id,
                externalCampaignId: campaign.externalId,
                name: campaign.name,
                status: campaign.status,
                enabled: campaign.enabled,
                budget: campaign.budget === 'unlimited' ? null : String(campaign.budget),
                bid: String(campaign.bid),
                spend: campaign.metrics.spend,
                impressions: campaign.metrics.impressions,
                clicks: campaign.metrics.clicks,
                conversions: campaign.metrics.conversions,
                ctr: campaign.metrics.ctr,
                cpc: campaign.metrics.cpc,
                cpa: campaign.metrics.cpa,
                syncedAt: new Date().toISOString(),
              })
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error'
            warnings.push(`${account.name}: ${msg}`)
            logger.error({ accountId: account.id, error: msg }, 'Failed to fetch campaigns from API')
          }
        })
      )

      // Sort results
      const sortedResults = sortCampaigns(results, query.sortBy, query.sortOrder)

      // Return with warnings if any errors
      if (warnings.length > 0) {
        return c.json({ data: sortedResults, warnings })
      }

      return c.json({ data: sortedResults })
    }

    // DEFAULT: No date filter = query DB (fast path)
    const conditions = []

    // Filter by source account
    if (query.sourceAccountId) {
      conditions.push(eq(campaignSyncs.sourceAccountId, query.sourceAccountId))
    } else {
      conditions.push(inArray(campaignSyncs.sourceAccountId, accountIds))
    }

    // Status filter
    if (query.status !== 'all') {
      conditions.push(eq(campaignSyncs.status, query.status))
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

    // Dedupe by externalCampaignId, keeping latest
    const latestByExternalId = new Map<string, typeof campaigns[0]>()
    for (const campaign of campaigns) {
      const key = `${campaign.sourceAccountId}:${campaign.externalCampaignId}`
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

    // Sort by CPC if requested
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

  // Get widgets for a campaign from traffic source API
  .get('/:sourceAccountId/:externalCampaignId/widgets', async (c) => {
    const userId = c.get('userId')
    const sourceAccountId = c.req.param('sourceAccountId')
    const externalCampaignId = c.req.param('externalCampaignId')

    // Verify user owns the source account
    const accounts = await db.select()
      .from(sourceAccounts)
      .where(and(
        eq(sourceAccounts.id, sourceAccountId),
        eq(sourceAccounts.userId, userId)
      ))

    if (accounts.length === 0) {
      return c.json({ error: 'Source account not found' }, 404)
    }

    const account = accounts[0]

    try {
      // Get authenticated traffic source client
      const source = await getAuthenticatedSource(account.id)

      // Fetch widgets from traffic source API
      const widgets = await source.getWidgets({ campaignId: externalCampaignId })

      // Map to response format
      const data = widgets.map((w) => ({
        id: w.id,
        externalId: w.externalId,
        name: w.name,
        domain: w.domain,
        metrics: {
          spend: w.metrics.spend,
          impressions: w.metrics.impressions,
          clicks: w.metrics.clicks,
          conversions: w.metrics.conversions,
          ctr: w.metrics.ctr,
          cpc: w.metrics.cpc,
          cpa: w.metrics.cpa,
        },
      }))

      return c.json({ data })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      logger.error({ sourceAccountId, externalCampaignId, error: msg }, 'Failed to fetch widgets')
      return c.json({ error: `Failed to fetch widgets: ${msg}` }, 500)
    }
  })
