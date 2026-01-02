# Traffic Sources Quick Reference

**Phase**: 06 - Traffic Source Adapters
**Status**: Complete - 4 sources fully implemented
**Last Updated**: January 2, 2026

---

## Quick Source Comparison

| Aspect | Revcontent | Taboola | Outbrain | MGID |
|--------|-----------|---------|----------|------|
| **Auth Type** | OAuth2 | OAuth2 | Basic Auth | API Key |
| **Endpoint** | `/oauth/token` | `/oauth/token` | `/login` | None |
| **Token Duration** | 1 hour | 1 hour | 30 days | Never |
| **Rate Limit** | 100/min | 100/min | 30/sec | 100/min |
| **Refresh Rate** | Before expiry | Before expiry | 2/hour max | N/A |
| **Campaign List** | `/campaigns` | `/{account}/campaigns` | `/marketers/{id}/campaigns` | `/clients/{id}/campaigns` |
| **Widgets API** | `/campaigns/{id}/sources` | `/{account}/campaigns/{id}/performance/site` | `/marketers/{id}/campaigns/{id}/publications` | `/clients/{id}/campaigns/{id}/sources` |
| **Bid Adjust** | Per widget | Per widget | Per widget | Per widget |
| **Blacklist Method** | Block source | POST to blocking | POST to blocks | POST to ban |
| **Complexity** | Medium | Medium | High (strict limits) | Low |

---

## Credential Configuration

### Revcontent
```typescript
credentials: {
  clientId: "your-client-id",
  clientSecret: "your-client-secret"
}
```

### Taboola
```typescript
credentials: {
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
  accessToken: "your-account-id"  // Account ID goes here
}
```

### Outbrain
```typescript
credentials: {
  username: "your-username",
  password: "your-password",
  accessToken: "your-marketer-id"  // Marketer ID goes here
}
```

### MGID
```typescript
credentials: {
  clientId: "your-api-key",  // API key in clientId
  clientSecret: "your-client-id"  // Optional client ID
}
```

---

## Common Operations

### Get Authenticated Source
```typescript
import { getAuthenticatedSource } from './traffic-sources/index.js'

// Get authenticated instance for a source account
const source = await getAuthenticatedSource(sourceAccountId)
```

### List Campaigns
```typescript
// All sources implement same interface
const campaigns = await source.getCampaigns({
  page: 1,
  perPage: 100
})

// Returns normalized format
campaigns.map(c => ({
  id: c.id,
  name: c.name,
  status: c.status,      // 'active' | 'paused' | 'deleted' | 'pending'
  enabled: c.enabled,
  bid: c.bid,
  metrics: {
    spend: number,
    impressions: number,
    clicks: number,
    conversions: number,
    ctr: number,         // Calculated: clicks/impressions * 100
    cpa: number,         // Calculated: spend/conversions
    cpc: number          // Calculated or from API
  }
}))
```

### Get Single Campaign
```typescript
const campaign = await source.getCampaign(campaignId)
```

### Toggle Campaign Status
```typescript
const result = await source.toggleCampaign(campaignId)
// Returns: { enabled: true|false }
```

### List Publishers (Widgets)
```typescript
const widgets = await source.getWidgets({
  campaignId: "campaign-id",
  page: 1,
  perPage: 100
})

// Returns normalized widgets
widgets.map(w => ({
  id: w.id,
  externalId: w.externalId,
  campaignId: w.campaignId,
  name: w.name,
  domain: w.domain,
  enabled: w.enabled,
  metrics: { /* same as campaign */ }
}))
```

### Blacklist Widget
```typescript
const result = await source.blacklistWidget(campaignId, widgetId)
// Returns: { success: boolean, widgetId: string, error?: string }
```

### Adjust Widget Bid
```typescript
const result = await source.adjustWidgetBid(campaignId, widgetId, newBid)
// Returns: { success: boolean, widgetId: string, previousBid: number, newBid: number, error?: string }
```

---

## Error Handling

### Graceful Failures

Methods return result objects, not exceptions:

```typescript
const result = await source.blacklistWidget(campaignId, widgetId)

if (result.success) {
  console.log(`Blacklisted widget ${widgetId}`)
} else {
  console.error(`Failed to blacklist: ${result.error}`)
  // Continue processing other widgets
}
```

### API Errors

If critical error (auth failure, network error):
```typescript
try {
  const campaigns = await source.getCampaigns()
} catch (error) {
  // Handle auth or network failures
  if (error instanceof ApiError) {
    console.error(`API Error: ${error.code} - ${error.message}`)
  }
}
```

---

## Rate Limiting

### Automatic

Rate limiting is automatic and per-source:

```typescript
// This call automatically respects Taboola's 100/min limit
await this.rateLimiter.acquire()  // Waits if needed
const campaigns = await makeRequest(url)
```

### Manual Control (if needed)

```typescript
import { getRateLimiter } from './traffic-sources/utils/rate-limiter.js'

const limiter = getRateLimiter('taboola', { perMinute: 100 })
await limiter.acquire()  // Waits if limit reached
```

### Outbrain Special Handling

Outbrain has two rate limits:
- **Login**: 2 requests/hour (strict!)
- **General**: 30 requests/second

The library handles this automatically with longer token validity (30 days) to minimize logins.

---

## Metrics Extraction

### Automatic Calculation

```typescript
import { extractMetrics } from './traffic-sources/utils/request-helpers.js'

// Works with any source's data format
const metrics = extractMetrics({
  spent: 100,          // or 'spend'
  impressions: 10000,
  clicks: 200,
  conversions: 10,
  cpc: 0.5
})

// Returns:
{
  spend: 100,
  impressions: 10000,
  clicks: 200,
  conversions: 10,
  ctr: 2,              // clicks/impressions * 100
  cpa: 10,             // spend/conversions
  cpc: 0.5
}
```

### Handles Field Variations

```typescript
// Taboola uses 'spent'
extractMetrics({ spent: 100, impressions: 10000, /* ... */ })

// Revcontent uses 'spend'
extractMetrics({ spend: 100, impressions: 10000, /* ... */ })

// Both work identically - single source of truth
```

---

## Token Management

### Automatic Refresh

Tokens are automatically refreshed before expiry:

```typescript
// Called before every API operation
private async ensureAuthenticated(): Promise<void> {
  if (!this.isAuthenticated() || this.isTokenExpiringSoon(bufferMs)) {
    await this.refreshAuth()
  }
}

// Outbrain: 2-hour refresh buffer (conservative for 2/hour login limit)
// Taboola: 5-minute refresh buffer
// MGID: No refresh needed (API key)
// Revcontent: 5-minute refresh buffer
```

### Token Caching

Tokens cached in database and memory:
```typescript
// First call: authenticate
const source = await getAuthenticatedSource(sourceAccountId)
// DB updated with token + expiry

// Subsequent calls (within token lifetime)
const source = await getAuthenticatedSource(sourceAccountId)
// Returns cached instance immediately
```

---

## Status Mapping

### Taboola Status → Normalized
```
'RUNNING', 'ACTIVE'        → 'active'
'PAUSED', 'FROZEN'         → 'paused'
'TERMINATED', 'DELETED'    → 'deleted'
Other                       → 'pending'
```

### Outbrain Status → Normalized
```
Similar mapping to Taboola
```

### MGID Status → Normalized
```
Similar mapping
```

### Revcontent Status → Normalized
```
Similar mapping
```

---

## Testing

### Unit Tests

Each adapter has tests for:
- Authentication (success, failure, refresh)
- Campaign operations (list, get, toggle)
- Widget operations (list, blacklist, adjust bid)
- Rate limiting (respect limits, retry on throttle)
- Metrics extraction (field variations, calculations)

### Running Tests

```bash
# Run all traffic source tests
npm run test -- traffic-sources/

# Run specific source tests
npm run test -- traffic-sources/taboola.test.ts
npm run test -- traffic-sources/outbrain.test.ts
npm run test -- traffic-sources/mgid.test.ts
```

---

## Common Patterns

### Pattern: Fetch All Campaigns

```typescript
import { getAuthenticatedSource } from './traffic-sources/index.js'

async function fetchAllCampaigns(sourceAccountId: string) {
  const source = await getAuthenticatedSource(sourceAccountId)

  const campaigns = await source.getCampaigns({
    page: 1,
    perPage: 100
  })

  return campaigns
}
```

### Pattern: Blacklist Low Performers

```typescript
async function blacklistLowPerformers(sourceAccountId: string) {
  const source = await getAuthenticatedSource(sourceAccountId)
  const campaigns = await source.getCampaigns()

  for (const campaign of campaigns) {
    const widgets = await source.getWidgets({ campaignId: campaign.id })

    for (const widget of widgets) {
      if (widget.metrics.cpa > 50) {  // High CPA
        const result = await source.blacklistWidget(campaign.id, widget.id)

        if (result.success) {
          console.log(`Blacklisted ${widget.name} (CPA: ${widget.metrics.cpa})`)
        }
      }
    }
  }
}
```

### Pattern: Increase Bids for Winners

```typescript
async function increaseBidsForWinners(sourceAccountId: string) {
  const source = await getAuthenticatedSource(sourceAccountId)
  const campaigns = await source.getCampaigns()

  for (const campaign of campaigns) {
    const widgets = await source.getWidgets({ campaignId: campaign.id })

    for (const widget of widgets) {
      if (widget.metrics.cpa < 20) {  // Low CPA = good
        const newBid = widget.metrics.cpc * 1.2  // Increase by 20%

        const result = await source.adjustWidgetBid(
          campaign.id,
          widget.id,
          newBid
        )

        if (result.success) {
          console.log(`Bid increased: ${result.previousBid} → ${result.newBid}`)
        }
      }
    }
  }
}
```

---

## Debugging Tips

### Check Authentication Status

```typescript
const source = await getAuthenticatedSource(sourceAccountId)

console.log('Authenticated:', source.isAuthenticated())
console.log('Token expires soon:', source.isTokenExpiringSoon(5 * 60 * 1000))
```

### Log Rate Limiter State

```typescript
// Rate limiter tracks request history
// Useful for understanding why calls are slow
```

### Verify Metrics Calculation

```typescript
import { extractMetrics } from './traffic-sources/utils/request-helpers.js'

const raw = { spent: 100, impressions: 10000, clicks: 200, conversions: 10 }
const metrics = extractMetrics(raw)

console.log(`CTR: ${metrics.ctr}% (should be 2%)`)
console.log(`CPA: $${metrics.cpa} (should be $10)`)
console.log(`CPC: $${metrics.cpc} (should be $0.50)`)
```

---

## Performance Notes

### Campaign Fetching Time

For 100 campaigns with 10 widgets each:

- **Taboola**: ~1.2s (2 requests)
- **Outbrain**: ~3.3s (11 requests, pagination limit)
- **MGID**: ~1.2s (2 requests)
- **Revcontent**: ~1.2s (2 requests)

### Outbrain Slower Due To

- 50-item pagination limit (vs 100 for others)
- Must make more requests to fetch same campaign count
- Strict 30 req/sec limit adds latency

### Memory Usage

- Per-source rate limiter: ~1KB (tracking request history)
- Cached instance: varies (depends on token + credentials size)
- Minimal overhead

---

## Related Documentation

- **Detailed Implementation**: See `PHASE-06-SUMMARY.md`
- **System Architecture**: See `system-architecture.md` Section 5
- **API Endpoints**: See `api-docs.md` - Campaigns/Widgets sections
- **Code Standards**: See `code-standards.md` for patterns
- **Testing Guide**: See `testing-guide.md` for test examples

---

## Next Steps

When implementing Phase 07 (Campaign Sync Service):

1. Use `getCampaigns()` to fetch from all sources
2. Use `extractMetrics()` to normalize metrics
3. Store in `campaign_syncs` table
4. Detect metric changes and generate alerts
5. Use `getWidgets()` to fetch publishers
6. Match against blacklist in `widget_blacklist` table
7. Filter blacklisted widgets from metrics

See Phase 07 documentation for implementation details.
