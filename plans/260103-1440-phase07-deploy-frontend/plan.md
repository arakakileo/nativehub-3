---
title: "NativeHub 3.0 Phases 7-9: Job Queue, Deploy, Frontend"
description: "Upgrade job queue to pg-boss, deploy to VPS with Traefik, build production-ready dashboard"
status: in-progress
priority: P1
effort: 13h
branch: main
tags: [pg-boss, docker, traefik, react, deployment]
created: 2026-01-03
---

# NativeHub 3.0 Implementation Plan (Phases 7-9)

## Overview

Complete production deployment pipeline: Replace node-cron with pg-boss for persistent job queue, deploy to VPS with zero-downtime, then enhance frontend dashboard.

## Phases

| Phase | Title | Priority | Effort | Status | Document |
|-------|-------|----------|--------|--------|----------|
| 7 | Job Queue Upgrade | P1 | 2h | completed | [phase-07-job-queue-upgrade.md](./phase-07-job-queue-upgrade.md) |
| 8 | Production Deploy | P1 | 3h | pending | [phase-08-production-deploy.md](./phase-08-production-deploy.md) |
| 9 | Frontend Dashboard | P2 | 8h | pending | [phase-09-frontend-dashboard.md](./phase-09-frontend-dashboard.md) |

## Dependencies

```
Phase 7 (pg-boss) ─┐
                   ├──> Phase 8 (Deploy) ──> Phase 9 (Frontend)
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

- Jobs survive server restarts (pg-boss persistence)
- Zero-downtime deploys verified via health checks
- Dashboard loads < 2s, all CRUD operations functional

## Unresolved Questions

1. Max retry delay cap for pg-boss (15 min recommended)?
2. Dead letter queue alerting mechanism?
3. Blue-green vs rolling updates for production?
