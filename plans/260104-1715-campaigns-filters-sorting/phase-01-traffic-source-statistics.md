# Phase 01: Traffic Source Statistics API Integration

## Context
- Parent: [plan.md](./plan.md)
- Research: [outbrain-api-research.md](./research/outbrain-api-research.md)
- Files: `apps/api/src/traffic-sources/*/index.ts`

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-01-04 |
| Priority | P1 |
| Implementation | pending |
| Review | pending |
| Effort | 3h |

## Key Insights

Current `getCampaigns()` in all traffic source adapters only fetches campaign metadata. Performance metrics (spend, clicks, impressions) require separate statistics API calls for each source:

| Source | Stats Endpoint | Rate Limit |
|--------|---------------|------------|
| Outbrain | `/campaigns/{id}/performanceByContent` | 10 req/min |
| Taboola | `/campaigns/{id}/reports/campaign-summary` | 100 req/min |
| Revcontent | `/stats/v1/boosts` | 60 req/min |
| MGID | `/goodhits/clients/{id}/campaigns/{id}/stat` | 30 req/min |

## Requirements

1. Add `getCampaignStatistics()` method to each traffic source
2. Modify `getCampaigns()` to fetch stats in parallel with rate limiting
3. Handle rate limits per source configuration
4. Graceful fallback if stats fail

## Architecture

```
getCampaigns()
    ↓
1. Fetch campaign list from source API
    ↓
2. For each campaign (parallel with rate limiter):
   Fetch statistics from stats endpoint
    ↓
3. Merge metrics into NormalizedCampaign
    ↓
Return campaigns with real metrics
```

## Related Code Files

- `apps/api/src/traffic-sources/outbrain/index.ts` - Outbrain adapter
- `apps/api/src/traffic-sources/taboola/index.ts` - Taboola adapter
- `apps/api/src/traffic-sources/revcontent/index.ts` - Revcontent adapter
- `apps/api/src/traffic-sources/mgid/index.ts` - MGID adapter
- `apps/api/src/traffic-sources/interface.ts` - Base interface
- `apps/api/src/services/campaign-sync.ts` - Sync service

## Implementation Steps

### Step 1: Outbrain Statistics

```typescript
// apps/api/src/traffic-sources/outbrain/index.ts
async getCampaignStatistics(campaignId: string): Promise<CampaignStats> {
  await this.rateLimiter.acquire()

  const url = buildUrl(config.baseUrl,
    `/marketers/${this.marketerId}/campaigns/${campaignId}/performanceByContent`)

  const response = await makeRequest<{ results: any[] }>(url, {
    headers: { 'OB-TOKEN-V1': this.accessToken! }
  })

  // Aggregate content-level stats
  return response.results.reduce((acc, r) => ({
    spend: acc.spend + (r.spend || 0),
    impressions: acc.impressions + (r.impressions || 0),
    clicks: acc.clicks + (r.clicks || 0),
    conversions: acc.conversions + (r.conversions || 0),
  }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 })
}
```

### Step 2: Taboola Statistics

**Research Taboola API docs first** - `/campaigns/{id}/reports/campaign-summary`

```typescript
// apps/api/src/traffic-sources/taboola/index.ts
async getCampaignStatistics(campaignId: string): Promise<CampaignStats> {
  await this.rateLimiter.acquire()

  // Taboola uses different endpoint structure
  const url = buildUrl(config.baseUrl,
    `/backstage/api/1.0/${this.accountId}/reports/campaign-summary/dimensions/campaign_breakdown`, {
      campaign: campaignId,
      start_date: this.getDefaultStartDate(),
      end_date: this.getDefaultEndDate(),
    })

  const response = await makeRequest<{ results: any[] }>(url, {
    headers: { Authorization: `Bearer ${this.accessToken}` }
  })

  // Map Taboola fields
  const data = response.results[0] || {}
  return {
    spend: data.spent || 0,
    impressions: data.impressions || 0,
    clicks: data.clicks || 0,
    conversions: data.conversions || 0,
  }
}
```

### Step 3: Revcontent Statistics

**Research Revcontent API docs first** - `/stats/v1/boosts`

```typescript
// apps/api/src/traffic-sources/revcontent/index.ts
async getCampaignStatistics(campaignId: string): Promise<CampaignStats> {
  await this.rateLimiter.acquire()

  const url = buildUrl(config.baseUrl, `/stats/v1/boosts`, {
    boost_id: campaignId,
    date_from: this.getDefaultStartDate(),
    date_to: this.getDefaultEndDate(),
  })

  const response = await makeRequest<{ data: any }>(url, {
    headers: { Authorization: `Bearer ${this.accessToken}` }
  })

  return {
    spend: response.data.spend || 0,
    impressions: response.data.impressions || 0,
    clicks: response.data.clicks || 0,
    conversions: response.data.conversions || 0,
  }
}
```

### Step 4: MGID Statistics

**Research MGID API docs first** - `/goodhits/clients/{id}/campaigns/{id}/stat`

```typescript
// apps/api/src/traffic-sources/mgid/index.ts
async getCampaignStatistics(campaignId: string): Promise<CampaignStats> {
  await this.rateLimiter.acquire()

  const url = buildUrl(config.baseUrl,
    `/goodhits/clients/${this.clientId}/campaigns/${campaignId}/stat`)

  const response = await makeRequest<any>(url, {
    headers: { Authorization: `Bearer ${this.accessToken}` }
  })

  return {
    spend: response.cost || 0,
    impressions: response.imps || 0,
    clicks: response.clicks || 0,
    conversions: response.conversions || 0,
  }
}
```

### Step 5: Update getCampaigns in All Adapters

```typescript
// Generic pattern for all adapters
async getCampaigns(options: ListCampaignsOptions = {}): Promise<NormalizedCampaign[]> {
  await this.ensureAuthenticated()

  // Fetch campaign list
  const campaigns = await this.fetchCampaignList(options)

  // Fetch stats in parallel with rate limiting
  const campaignsWithStats = await Promise.all(
    campaigns.map(async (campaign) => {
      try {
        const stats = await this.getCampaignStatistics(campaign.id)
        return this.normalizeCampaign(campaign, stats)
      } catch (error) {
        logger.warn({ campaignId: campaign.id, error }, 'Failed to fetch stats')
        return this.normalizeCampaign(campaign) // Return without stats
      }
    })
  )

  return campaignsWithStats
}
```

## Todo List

### Outbrain
- [ ] Add getCampaignStatistics method
- [ ] Modify getCampaigns to fetch stats
- [ ] Test with real account

### Taboola
- [ ] Research Taboola reports API documentation
- [ ] Add getCampaignStatistics method
- [ ] Modify getCampaigns to fetch stats
- [ ] Test with real account

### Revcontent
- [ ] Research Revcontent stats API documentation
- [ ] Add getCampaignStatistics method
- [ ] Modify getCampaigns to fetch stats
- [ ] Test with real account

### MGID
- [ ] Research MGID stats API documentation
- [ ] Add getCampaignStatistics method
- [ ] Modify getCampaigns to fetch stats
- [ ] Test with real account

## Success Criteria
- [ ] All 4 traffic sources return real metrics
- [ ] Rate limits respected per source
- [ ] Graceful fallback if individual stats fail
- [ ] Sync completes within reasonable time

## Risk Assessment
- **Medium**: Each source has different API structure. Mitigation: Research docs for each
- **Medium**: Rate limits vary. Mitigation: Configure per-source rate limiters
- **Low**: Some APIs may not have stats endpoint. Mitigation: Use campaign-level metrics if available

## Security Considerations
- No new credentials exposed
- Existing rate limiters handle per-source limits
- API tokens already managed securely
