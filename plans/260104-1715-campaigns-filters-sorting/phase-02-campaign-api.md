# Phase 02: Campaign API Enhancements

## Context
- Parent: [plan.md](./plan.md)
- Depends on: [Phase 01](./phase-01-outbrain-statistics.md)
- Files: `apps/api/src/routes/campaigns.ts`, `apps/api/src/services/campaign-sync.ts`

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-01-04 |
| Priority | P1 |
| Implementation | pending |
| Review | pending |
| Effort | 1h |

## Requirements

1. Add query parameters: `from`, `to`, `status`, `sortBy`, `sortOrder`
2. Return CPC in campaign response
3. Support server-side sorting
4. Add status filtering at database level

## Architecture

```
GET /api/v1/campaigns?from=2026-01-01&to=2026-01-31&status=active&sortBy=spend&sortOrder=desc

Response:
{
  data: [
    {
      id, name, status, spend, clicks, impressions, conversions, ctr, cpc, cpa, ...
    }
  ]
}
```

## Related Code Files

- `apps/api/src/routes/campaigns.ts:9-66` - List campaigns endpoint
- `apps/api/src/db/schema.ts:67-94` - campaignSyncs table
- `apps/web/src/lib/api.ts:84-87` - getCampaigns API method

## Implementation Steps

### Step 1: Add Query Params Schema

```typescript
// In campaigns.ts
const ListCampaignsQuerySchema = z.object({
  sourceAccountId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['active', 'paused', 'deleted', 'all']).optional().default('all'),
  sortBy: z.enum(['name', 'spend', 'conversions', 'clicks', 'cpc']).optional().default('name'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
})
```

### Step 2: Update List Campaigns Endpoint

```typescript
.get('/', async (c) => {
  const userId = c.get('userId')
  const query = ListCampaignsQuerySchema.parse(c.req.query())

  // Get user's source accounts
  const accounts = await db.select({ id: sourceAccounts.id })
    .from(sourceAccounts)
    .where(eq(sourceAccounts.userId, userId))

  if (accounts.length === 0) {
    return c.json({ data: [] })
  }

  const accountIds = accounts.map((a) => a.id)

  // Build query conditions
  const conditions = [
    query.sourceAccountId
      ? eq(campaignSyncs.sourceAccountId, query.sourceAccountId)
      : inArray(campaignSyncs.sourceAccountId, accountIds),
  ]

  // Status filter
  if (query.status !== 'all') {
    conditions.push(eq(campaignSyncs.status, query.status))
  }

  // Date filter (filter by syncedAt for now)
  if (query.from) {
    conditions.push(gte(campaignSyncs.syncedAt, new Date(query.from)))
  }
  if (query.to) {
    conditions.push(lte(campaignSyncs.syncedAt, new Date(query.to + 'T23:59:59Z')))
  }

  // Sorting
  const sortColumn = {
    name: campaignSyncs.campaignName,
    spend: campaignSyncs.spend,
    conversions: campaignSyncs.conversions,
    clicks: campaignSyncs.clicks,
    cpc: campaignSyncs.spend, // Will compute CPC in response
  }[query.sortBy] || campaignSyncs.campaignName

  const orderFn = query.sortOrder === 'desc' ? desc : asc

  // Execute query
  const campaigns = await db
    .select()
    .from(campaignSyncs)
    .where(and(...conditions))
    .orderBy(orderFn(sortColumn))

  return c.json({
    data: campaigns.map((c) => ({
      id: c.id,
      sourceAccountId: c.sourceAccountId,
      externalCampaignId: c.externalCampaignId,
      name: c.campaignName,
      status: c.status,
      enabled: c.enabled,
      budget: c.budget,
      bid: c.bid,
      spend: parseFloat(c.spend),
      impressions: c.impressions,
      clicks: c.clicks,
      conversions: c.conversions,
      ctr: parseFloat(c.ctr),
      cpc: c.clicks > 0 ? parseFloat(c.spend) / c.clicks : 0,
      cpa: parseFloat(c.cpa),
      syncedAt: c.syncedAt,
    })),
  })
})
```

### Step 3: Add Required Imports

```typescript
import { eq, and, inArray, gte, lte, asc, desc } from 'drizzle-orm'
import { z } from 'zod'
```

## Todo List
- [ ] Add ListCampaignsQuerySchema
- [ ] Add drizzle-orm filter/sort imports
- [ ] Implement status filtering
- [ ] Implement date filtering
- [ ] Implement sorting by column
- [ ] Add CPC to response
- [ ] Remove deduplication logic (use unique constraint instead)
- [ ] Test with different filter combinations

## Success Criteria
- [ ] `/campaigns?status=active` returns only active campaigns
- [ ] `/campaigns?from=2026-01-01&to=2026-01-31` filters by date
- [ ] `/campaigns?sortBy=spend&sortOrder=desc` sorts correctly
- [ ] Response includes `cpc` field

## Risk Assessment
- **Low**: Breaking change to API response (adding `cpc`). Safe - new field
- **Low**: Empty results with strict filters. OK - expected behavior

## Security Considerations
- User can only see their own campaigns (existing check preserved)
- Input validation with Zod prevents SQL injection
