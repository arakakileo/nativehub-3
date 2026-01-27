---
title: "Optimizer Page Update"
description: "Update frontend optimizer page to match Phase 4 backend endpoints"
status: pending
priority: P1
effort: 6h
branch: feat/optimizer-page-update
tags: [frontend, optimizer, phase-4]
created: 2026-01-05
---

# Optimizer Page Update - Implementation Plan

## Context Links
- Backend API Docs: `docs/api-docs.md` (lines 484-745)
- Current Optimizer Page: `apps/web/src/pages/Optimizer.tsx`
- Current Hooks: `apps/web/src/hooks/useOptimizer.ts`
- Router: `apps/web/src/App.tsx`

## Overview
Update frontend optimizer module to match Phase 4 backend endpoints. Current page uses old rule-based approach; new version uses campaign-centric optimizer with per-campaign settings.

## Key Changes
| Current | New |
|---------|-----|
| Rules tab default | Campaigns tab default |
| Global rules | Per-campaign optimizer config |
| Single /optimizer page | /optimizer, /optimizer/:id, /optimizer/:id/widgets |
| Run all only | Run all + per-campaign run |

## Phases (4)

### Phase 1: API Hooks Update (1.5h)
Update `lib/api.ts` and `hooks/useOptimizer.ts` to use new endpoints.
- File: `phase-01-api-hooks-update.md`

### Phase 2: Optimizer List Page (1.5h)
Refactor `/optimizer` to show campaigns with create modal.
- File: `phase-02-optimizer-list-page.md`

### Phase 3: Optimizer Detail Page (2h)
Create `/optimizer/:id` with tabs for settings, rules, actions.
- File: `phase-03-optimizer-detail-page.md`

### Phase 4: Widgets Page (1h)
Create `/optimizer/:id/widgets` showing campaign widgets with metrics.
- File: `phase-04-widgets-page.md`

## Dependencies
- Existing: DataTable, StatusBadge, Button, Modal, EmptyState
- Backend: All Phase 4 endpoints available

## Success Criteria
1. Default tab shows optimizer campaigns
2. Create campaign modal works from optimizer + campaigns page
3. Campaign detail page shows all settings with tabs
4. Run button works per-campaign and globally
5. Widgets page displays campaign widgets with blacklist action

## Risks
| Risk | Mitigation |
|------|------------|
| Backend API mismatch | Validate responses match api-docs.md |
| Large widget lists | Use pagination from DataTable |
| Modal conflicts | Reuse existing Modal component |
