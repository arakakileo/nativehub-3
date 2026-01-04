---
title: "Auto-Test Source Account Connection"
description: "Auto-call test endpoint after account creation to enable sync"
status: pending
priority: P1
effort: 1h
branch: master
tags: [frontend, source-accounts, fix]
created: 2026-01-04
---

# Auto-Test Source Account Connection

## Problem
Source accounts created with status `pending`. Sync endpoint rejects with 400 "Account not active" because it requires `connected` or `active` status.

## Solution
Auto-call `/test` endpoint after account creation to authenticate with traffic source API and update status to `connected`.

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | Add Test Endpoint & Hook | pending | 30min | [phase-01](./phase-01-add-test-endpoint.md) |
| 2 | Auto-Test After Create | pending | 30min | [phase-02](./phase-02-auto-test-flow.md) |

## Files to Modify
- `apps/web/src/lib/api.ts` - Add testSourceAccount method
- `apps/web/src/hooks/useSourceAccounts.ts` - Add useTestSourceAccount hook
- `apps/web/src/pages/SourceAccounts.tsx` - Chain test after create

## Success Criteria
- [ ] New account auto-tests connection after creation
- [ ] Account status becomes `connected` on success
- [ ] Sync works immediately after account creation
- [ ] Error handling shows appropriate messages
