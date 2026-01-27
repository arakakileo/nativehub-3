---
title: "Auto-Test Source Account Connection"
description: "Auto-call test endpoint after account creation to enable sync"
status: completed
priority: P1
effort: 1h
branch: master
tags: [frontend, source-accounts, fix]
created: 2026-01-04
completed: 2026-01-04
---

# Auto-Test Source Account Connection

## Problem
Source accounts created with status `pending`. Sync endpoint rejects with 400 "Account not active" because it requires `connected` or `active` status.

## Solution
Auto-call `/test` endpoint after account creation to authenticate with traffic source API and update status to `connected`.

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | Add Test Endpoint & Hook | ✅ done | 30min | [phase-01](./phase-01-add-test-endpoint.md) |
| 2 | Auto-Test After Create | ✅ done | 30min | [phase-02](./phase-02-auto-test-flow.md) |

## Files Modified
- `apps/web/src/lib/api.ts` - Added testSourceAccount method
- `apps/web/src/hooks/useSourceAccounts.ts` - Added useTestSourceAccount hook
- `apps/web/src/pages/SourceAccounts.tsx` - Chained test after create, added Test Connection button

## Success Criteria
- [x] New account auto-tests connection after creation
- [x] Account status becomes `connected` on success
- [x] Sync works immediately after account creation
- [x] Error handling shows appropriate messages
- [x] Manual Test Connection button for existing pending accounts
