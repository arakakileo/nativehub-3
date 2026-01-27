---
title: "Campaigns Filters, Sorting & CPC Column"
description: "Add date/status filters, column sorting, CPC column, and fix data fetching"
status: pending
priority: P1
effort: 6h
branch: master
tags: [frontend, backend, campaigns, filters, outbrain, taboola, revcontent, mgid]
created: 2026-01-04
validated: 2026-01-04
---

# Campaigns Filters, Sorting & CPC Column

## Problem

1. No date filters for campaign data
2. No status filter (active/paused/deleted)
3. No column sorting (name, spend, conversions)
4. Missing average CPC column
5. Campaign data not being fetched from Outbrain (sync returns 0 metrics)

## Solution

Implement frontend filters/sorting + fix backend statistics fetching for ALL traffic sources.

## Root Cause Analysis

Current `getCampaigns` in traffic source adapters only fetches campaign metadata, NOT performance stats. Each source requires separate statistics API calls to get metrics (spend, clicks, impressions, conversions).

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | Backend - Fix All Traffic Source Statistics | pending | 3h | [phase-01](./phase-01-traffic-source-statistics.md) |
| 2 | Backend - Campaign API Enhancements | pending | 1h | [phase-02](./phase-02-campaign-api.md) |
| 3 | Frontend - Filters & Sorting UI | pending | 2h | [phase-03](./phase-03-frontend-filters.md) |

## Files to Modify

**Backend:**
- `apps/api/src/traffic-sources/outbrain/index.ts` - Add statistics endpoint
- `apps/api/src/traffic-sources/taboola/index.ts` - Add statistics endpoint
- `apps/api/src/traffic-sources/revcontent/index.ts` - Add statistics endpoint
- `apps/api/src/traffic-sources/mgid/index.ts` - Add statistics endpoint
- `apps/api/src/services/campaign-sync.ts` - Merge stats with campaign data
- `apps/api/src/routes/campaigns.ts` - Add query params for filters/sorting

**Frontend:**
- `apps/web/src/pages/Campaigns.tsx` - Add filter UI, sorting, CPC column
- `apps/web/src/hooks/useCampaigns.ts` - Add filter params to query
- `apps/web/src/lib/api.ts` - Add filter params to getCampaigns

## Success Criteria

- [ ] All traffic sources show real metrics (spend, clicks, conversions)
- [ ] Date filter by syncedAt
- [ ] Status filter: active/paused only by default, active shown first
- [ ] Default sort: active first, then by spend (desc)
- [ ] All columns sortable
- [ ] CPC column shows average cost per click
- [ ] Publishers/widgets sorted by spend by default

## Validation Summary

**Validated:** 2026-01-04
**Questions asked:** 5

### Confirmed Decisions
- **Rate limits**: Fetch stats in parallel with rate limiting during sync
- **Date filter**: Filter by `syncedAt` (when data was synced to NativeHub)
- **Status filter**: Show only active/paused by default, active first
- **Default sort**: Active campaigns first, then by spend descending
- **Scope**: Fix ALL traffic sources (Outbrain, Taboola, Revcontent, MGID)

### Action Items
- [x] Expand Phase 1 to include all traffic sources
- [x] Update effort estimate (4h → 6h)
- [ ] Research each traffic source API documentation during implementation
- [ ] Add publisher/widget sorting by spend (future phase)

## Research References

- [Outbrain API Research](./research/outbrain-api-research.md)
