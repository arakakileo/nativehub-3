# Outbrain API Campaign Performance Research

**Date**: 2026-01-04 | **Status**: Complete

## Executive Summary

Outbrain Amplify API provides RESTful access to campaign performance metrics, supporting spend, impressions, clicks, conversions, and CPC data. API is available by partner request with documented rate limits and filtering capabilities.

---

## 1. Campaign Performance Metrics

### Available Metrics
- **Core**: Clicks, Impressions, Spend, Conversions
- **Derived**: CPC (Cost Per Click), CPM (Cost Per Thousand), CTR (Clickthrough Rate), CPA (Cost Per Acquisition)
- **Advanced**: ROAS (Return on Ad Spend), View Conversions, Video Metrics

### Data Reporting Delay
- Standard Reports: 2–4 hour delay (clicks, impressions, spend, conversions)
- Real-time Data: Available via separate `/realtime` endpoints
- Settings Data: Real-time (budgets, delivery, CPC limits)

### Endpoints Structure
- Campaign statistics (aggregate)
- Campaign statistics by Publisher
- Campaign statistics by Content
- Campaign statistics by Geo

**Reference**: [Outbrain Amplify API Help](https://www.outbrain.com/help/advertisers/amplify-api/)

---

## 2. Date Range Filtering

### Supported Filters
- `fromBudgetStartDate` - Start date for campaign budget period
- `toBudgetEndDate` - End date for campaign budget period
- `includeArchived` - Include/exclude archived campaigns (default: false)

### Example Query
```
/amplify/v0.1/marketers/{marketer_id}/campaigns?
  includeArchived=true&
  fromBudgetStartDate=2021-03-01&
  toBudgetEndDate=2021-04-14
```

### Limitations
- No explicit `lastModified` filter (feature requested but not yet implemented)
- Date-based archive filtering by creation date requested but unavailable
- Budget-based date filtering is primary approach

**Reference**: [Filter Campaigns by Date](https://groups.google.com/g/outbrain-amplifyapi/c/Kb7ffbP9S3Q)

---

## 3. Campaign Status Filtering

### Status Types
- **Active**: Campaign with live traffic (Play icon indicator)
- **Paused**: Campaign halted (Pause icon indicator)
- **Archived**: Inactive 3+ months (accessible via `includeArchived=true`)

### Filtering Capability
- Filter by `includeArchivedCampaigns` parameter
- Sections endpoints return only sections with traffic by default
- Non-archived campaigns: `includeArchivedCampaigns=false` (default)

### Dashboard Status View
- "Status" & "Delivery" columns show campaign state
- "Include Archived" button toggles archived data visibility

**Reference**: [Monitor Campaign Status](https://www.outbrain.com/help/advertisers/monitor-campaign-status/)

---

## 4. Sorting & Ordering Capabilities

### Known Limitations
**Data gap identified**: Official documentation does not publicly detail sorting/ordering parameters for statistics endpoints.

### Assumptions Based on RESTful Standards
- Likely supports `sortBy` parameter (field name)
- Likely supports `sortOrder` parameter (ASC/DESC)
- Probable fields: spend, clicks, impressions, CTR, CPA

### Required Action
- Access full Apiary documentation at [amplifyv01.docs.apiary.io](https://amplifyv01.docs.apiary.io/) for complete parameter specifications
- Post to [Outbrain API Google Group](https://groups.google.com/forum/#!forum/outbrain-amplifyapi) for sorting clarification

---

## 5. Rate Limits & Best Practices

### Hard Limits
| Endpoint | Limit |
|----------|-------|
| Login (`/login`) | 2 req/hour per user |
| Single Token Usage | 30 req/second |
| Performance Reporting | 10 req/minute per marketer |
| Real-time Performance | 50 req/minute per marketer |

### Error Handling
- Rate limit violation: HTTP 429 (Too Many Requests)
- Response includes `rate-limit-msec-left` header (remaining milliseconds)

### Token Management
- Valid for 30 days
- Generate new tokens only when needed (avoid auth limit)
- Multiple concurrent tokens supported
- Expired tokens immediately revoked

### Best Practices
1. **Batching**: Combine related requests to reduce API calls
2. **Exponential Backoff**: Start 1s, double on failure (1s → 2s → 4s → 8s)
3. **Caching**: Cache results between polling intervals
4. **Request Queues**: Serialize requests to prevent concurrent limit hits
5. **Token Reuse**: Store active tokens; refresh every 25–27 days

### Known Constraints
- Hard limit: 500 active campaigns per marketer (non-adjustable)
- Rate limits cannot be increased per Outbrain policy
- Performance reporting limited to 10 req/min across entire marketer account

**References**:
- [Outbrain Amplify API Main Docs](https://www.outbrain.com/help/advertisers/amplify-api/)
- [Rate Limit Best Practices Discussion](https://groups.google.com/g/outbrain-amplifyapi/c/yU4D_68wCkg)

---

## Key Findings Summary

| Category | Status |
|----------|--------|
| Performance Metrics | ✓ Well-documented |
| Date Range Filtering | ✓ Budget-based dates supported |
| Campaign Status Filtering | ✓ Active/Paused/Archived supported |
| Sorting/Ordering | ✗ Documentation gap |
| Rate Limits | ✓ Clear, non-negotiable |

---

## Sources

- [Outbrain Amplify API Help](https://www.outbrain.com/help/advertisers/amplify-api/)
- [Amplify API Documentation Hub](https://developer.outbrain.com/home-page/amplify-api/)
- [Amplify API on Apiary](https://amplifyv01.docs.apiary.io/)
- [Real-Time Data Dashboard Guide](https://www.outbrain.com/help/advertisers/how-to-use-the-realtime-data-dashboard/)
- [Performance Reporting Customization](https://www.outbrain.com/help/advertisers/performance-reporting/)
- [Monitor Campaign Status](https://www.outbrain.com/help/advertisers/monitor-campaign-status/)
- [Outbrain Amplify Google Group](https://groups.google.com/forum/#!forum/outbrain-amplifyapi)

---

## Unresolved Questions

1. **Sorting Specification**: What exact `sortBy` and `sortOrder` parameters are supported by the `/statistics` endpoints? Are compound sorts supported?
2. **Filter Combinations**: Can date range and status filters be combined in single request? Is `AND`/`OR` logic supported?
3. **Pagination**: What pagination mechanism is used for large result sets? (offset, cursor, page-based?)
4. **Real-time Latency**: What is the exact latency for real-time performance reporting? Is sub-second possible?
5. **Archived Data Retention**: How long is archived campaign data retained? Is there a deletion policy?
6. **Metrics Availability**: Are all metrics (ROAS, video metrics) available for all campaigns, or only when tracking is enabled?

---

**Report Quality**: Concise summary of public API docs with clear gaps identified. Recommend direct API testing and Apiary documentation access for implementation.
