---
title: "Integrate Optimizer into Campaigns"
description: "Move optimizer from separate tab to embedded feature within campaign detail page"
status: pending
priority: P1
effort: 6h
branch: master
tags: [optimizer, campaigns, ui-restructure, ux]
created: 2026-01-05
---

# Integrate Optimizer into Campaigns

## Summary

Restructure the optimizer from a standalone page/tab to an embedded feature within campaigns. Users should click on a campaign row in `/campaigns` to open a campaign detail page that includes optimizer settings, widgets, and action history.

## Current State

- **Campaigns page** (`/campaigns`): Lists campaigns with metrics, no row click handler
- **Optimizer page** (`/optimizer`): Separate tab showing optimizer campaigns list
- **OptimizerDetail** (`/optimizer/:id`): Optimizer settings, rules, actions for one campaign
- **OptimizerWidgets** (`/optimizer/:id/widgets`): Widget list with blacklist management

## Target State

- **Campaigns page** (`/campaigns`): Clickable rows → navigate to `/campaigns/:id`
- **CampaignDetail** (`/campaigns/:id`): Unified view with tabs:
  - Overview (metrics, status)
  - Optimizer (settings, rules)
  - Widgets (active/blacklisted)
  - Actions (history log)
- **Remove** standalone `/optimizer` routes and navigation

## Phases

| Phase | Description | Status | Effort |
|-------|-------------|--------|--------|
| [Phase 1](./phase-01-campaign-detail-page.md) | Create CampaignDetail page with basic overview | Pending | 2h |
| [Phase 2](./phase-02-integrate-optimizer.md) | Move optimizer settings into CampaignDetail | Pending | 2h |
| [Phase 3](./phase-03-cleanup-routes.md) | Remove standalone optimizer pages, update nav | Pending | 1h |
| [Phase 4](./phase-04-testing.md) | E2E testing and polish | Pending | 1h |

## Key Changes

1. **Add row click handler** to Campaigns.tsx DataTable
2. **Create CampaignDetail.tsx** with tabbed interface
3. **Merge OptimizerDetail + OptimizerWidgets** into CampaignDetail tabs
4. **Remove /optimizer routes** from router and sidebar
5. **Update hooks** to support campaign-centric data fetching

## Dependencies

- Existing optimizer hooks: `useOptimizerCampaign`, `useUpdateOptimizerCampaign`
- Campaign hooks: `useCampaigns`, `useCampaignWidgets`
- UI components: `DataTable`, `StatusBadge`, `Button`

## Risk Assessment

- **Low risk**: No backend changes required
- **Medium risk**: State management for optimizer campaign creation flow
- **Mitigation**: Keep "Enable Optimizer" action in campaign detail if no optimizer config exists

## Success Criteria

- [ ] Clicking campaign row navigates to `/campaigns/:id`
- [ ] Campaign detail shows metrics + optimizer settings in tabs
- [ ] Widget management works within campaign context
- [ ] No `/optimizer` routes remain
- [ ] All existing optimizer functionality preserved
