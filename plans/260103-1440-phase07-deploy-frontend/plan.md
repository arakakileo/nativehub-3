---
title: "NativeHub 3.0 Phases 7-10: Job Queue, Deploy, Frontend, UAT"
description: "Upgrade job queue to pg-boss, deploy to VPS with Traefik, build production-ready dashboard, UAT & performance audit"
status: in-progress (Phases 7-10 completed, Phase 11+ pending)
priority: P1
effort: 17h
branch: main
tags: [pg-boss, docker, traefik, react, deployment, testing, performance]
created: 2026-01-03
---

# NativeHub 3.0 Implementation Plan (Phases 7-9)

## Overview

Complete production deployment pipeline: Replace node-cron with pg-boss for persistent job queue, deploy to VPS with zero-downtime, then enhance frontend dashboard.

## Phases

| Phase | Title | Priority | Effort | Status | Document |
|-------|-------|----------|--------|--------|----------|
| 7 | Job Queue Upgrade | P1 | 2h | completed | [phase-07-job-queue-upgrade.md](./phase-07-job-queue-upgrade.md) |
| 8 | Production Deploy | P1 | 3h | completed | [phase-08-production-deploy.md](./phase-08-production-deploy.md) |
| 9 | Frontend Dashboard | P2 | 8h | completed | [phase-09-frontend-dashboard.md](./phase-09-frontend-dashboard.md) |
| 10 | UAT & Performance Audit | P1 | 4h | completed | [phase-10-uat-performance.md](./phase-10-uat-performance.md) |

## Dependencies

```
Phase 7 (pg-boss) ─┐
                   ├──> Phase 8 (Deploy) ──> Phase 9 (Frontend) ──> Phase 10 (UAT)
Existing codebase ─┘
```

## Research Context

- [Job Queue Research](./research/researcher-01-job-queue.md) - pg-boss selected
- [Deploy Patterns Research](./research/researcher-02-deploy-patterns.md) - Multi-stage Docker + graceful shutdown

## Quick Start

```bash
# Phase 7: Test job queue locally
npm run dev --workspace=apps/api

# Phase 8: Deploy to VPS
ssh vps
cd /opt/nativehub && docker compose pull && docker rollout api

# Phase 9: Frontend dev
npm run dev --workspace=apps/web
```

## Success Metrics

- Jobs survive server restarts (pg-boss persistence) ✅
- Zero-downtime deploys verified via health checks ✅
- Dashboard loads < 2s, all CRUD operations functional ✅
- Unit tests: 300/300 pass ✅
- E2E tests: 6/7 pass (1 skipped) ✅
- Lighthouse Perf 99, A11y 98, Best Practices 96 ✅
- Bundle size 148KB gzip ✅
- Zero critical issues ✅

## Completed Phases Summary

**Phase 7 (Job Queue):** pg-boss integrated, node-cron replaced, job persistence enabled
**Phase 8 (Deploy):** VPS deployment with Traefik, zero-downtime rollouts configured
**Phase 9 (Frontend):** Dashboard built, all CRUD ops functional, responsive design
**Phase 10 (UAT):** All tests passing, Lighthouse scores excellent, production-ready

## Next Steps

- Phase 11: Production monitoring & alerting setup
- Phase 12: Analytics integration (optional)
- Phase 13: Performance optimization roadmap
