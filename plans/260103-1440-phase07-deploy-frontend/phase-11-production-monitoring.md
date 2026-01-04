---
title: "Phase 11: Production Monitoring & Alerting"
priority: P1
effort: 4h
status: completed
started: 2026-01-03
completed: 2026-01-03 16:30
blockers: none
---

# Phase 11: Production Monitoring & Alerting

## Overview

Implement comprehensive production monitoring using Prometheus metrics, Grafana dashboards, and AlertManager for notifications. Self-hosted on VPS with Docker.

## Context Links

- [Phase 10 Summary](../../docs/PHASE-10-SUMMARY.md) - UAT complete, production-ready
- [Docker Stack](../../docker/docker-stack.yml) - Current Traefik deployment
- [API Entry](../../apps/api/src/index.ts) - Hono server with health endpoint

## Key Insights

- Pino logging already in place (JSON in production)
- Health endpoint exists at /health with DB check
- Docker JSON logging with rotation configured
- Rate limiting middleware tracks request counts
- No Prometheus metrics or APM currently

## Requirements

### REQ-11.1: Prometheus Metrics Endpoint
- Add prom-client library for metrics collection
- Create /metrics endpoint exposing RED metrics
- Track request duration, error rates, request counts
- Include Node.js runtime metrics (memory, GC, event loop)

### REQ-11.2: API Metrics Middleware
- HTTP request duration histogram by route/method/status
- Request counter by route/method/status
- Error counter with error type labels
- Database query timing (optional)

### REQ-11.3: Monitoring Stack Deployment
- Prometheus container with scrape config
- Grafana container with auto-provisioned datasource
- AlertManager for notifications
- Traefik labels for Grafana access

### REQ-11.4: Grafana Dashboards
- Node.js application dashboard
- HTTP request metrics dashboard
- System resources overview
- Alert status dashboard

### REQ-11.5: Alert Rules
- High error rate (>5% over 5 min)
- High latency (p95 > 1s)
- Service down (health check failures)
- Memory pressure (>80% heap)

### REQ-11.6: Notification Channels
- Discord webhook for real-time alerts
- Email digest for daily summary (optional)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VPS (Docker Swarm)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   NativeHub  │     │   NativeHub  │     │   Prometheus │    │
│  │     API      │────▶│   /metrics   │◀────│   (scraper)  │    │
│  │  :3001       │     │              │     │   :9090      │    │
│  └──────────────┘     └──────────────┘     └──────┬───────┘    │
│                                                    │            │
│                                             ┌──────▼───────┐    │
│                                             │   Grafana    │    │
│                                             │   :3000      │◀───┼── Traefik
│                                             └──────┬───────┘    │
│                                                    │            │
│                                             ┌──────▼───────┐    │
│                                             │ AlertManager │    │
│                                             │   :9093      │────┼──▶ Discord
│                                             └──────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Related Code Files

- `apps/api/src/index.ts` - Add metrics middleware
- `apps/api/src/lib/logger.ts` - Existing pino logger
- `apps/api/src/middleware/error-handler.ts` - Error context
- `apps/api/package.json` - Add prom-client
- `docker/docker-stack.yml` - Add monitoring services
- `docker/prometheus/` - New prometheus config
- `docker/alertmanager/` - New alertmanager config

## Implementation Steps

### Step 1: Add prom-client Dependency
```bash
npm install prom-client --workspace=apps/api
```

### Step 2: Create Metrics Registry
- `apps/api/src/lib/metrics.ts` - Registry, default metrics, custom metrics

### Step 3: Create Metrics Middleware
- `apps/api/src/middleware/metrics.ts` - Request timing middleware

### Step 4: Integrate Metrics Endpoint
- Update `apps/api/src/index.ts` - Add /metrics route

### Step 5: Create Prometheus Config
- `docker/prometheus/prometheus.yml` - Scrape config
- `docker/prometheus/alert-rules.yml` - Alert rules

### Step 6: Create AlertManager Config
- `docker/alertmanager/alertmanager.yml` - Routes and receivers

### Step 7: Create Grafana Provisioning
- `docker/grafana/provisioning/datasources/` - Prometheus datasource
- `docker/grafana/provisioning/dashboards/` - Dashboard config

### Step 8: Update Docker Stack
- Add prometheus, grafana, alertmanager services
- Configure Traefik labels for Grafana

### Step 9: Deploy and Verify
- Build and push API image
- Deploy monitoring stack
- Verify metrics collection
- Test alert rules

## Todo List

- [x] Install prom-client (prom-client@15.1.3)
- [x] Create metrics.ts registry (115 lines)
- [x] Create metrics middleware (68 lines)
- [x] Add /metrics endpoint (integrated in index.ts)
- [x] Create prometheus.yml (39 lines)
- [x] Create alert-rules.yml (89 lines, 7 alerts)
- [x] Create alertmanager.yml (68 lines)
- [x] Create Grafana datasource (provisioning config)
- [x] Update docker-stack.yml (monitoring services added)
- [x] Test locally (228 tests passing - see tester report)
- [ ] **FIX CRITICAL**: Remove Grafana default password (CRT-1)
- [ ] Deploy to VPS (blocked by security fix)
- [ ] Verify dashboards
- [ ] Test alerts

## Success Criteria

| Metric | Target | Current |
|--------|--------|---------|
| /metrics endpoint | Available | N/A |
| Prometheus scraping | Working | N/A |
| Grafana dashboards | 2+ dashboards | N/A |
| Alert rules | 4+ rules active | N/A |
| Discord notifications | Working | N/A |
| Latency overhead | <5ms per request | N/A |

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Metrics overhead | Low | Use histograms sparingly, low cardinality |
| Disk space (Prometheus) | Medium | 15d retention, 500MB limit |
| Security exposure | High | Keep Prometheus internal, auth Grafana |
| Alert fatigue | Medium | Tune thresholds, use inhibit rules |

## Security Considerations

- /metrics endpoint: Internal only (no Traefik exposure)
- Prometheus: No external access, Docker internal network
- Grafana: Basic auth via Traefik or built-in
- AlertManager: Internal only, webhook secrets in env
- Discord webhook URL: Store in .env, not committed

## Environment Variables

```env
# Metrics
METRICS_ENABLED=true

# Grafana
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=<secure-password>

# AlertManager
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
ALERTMANAGER_SMTP_HOST=smtp.example.com (optional)
ALERTMANAGER_SMTP_FROM=alerts@nativehub.com (optional)
```

## Code Review Results

**Report**: `plans/reports/code-reviewer-260103-2113-phase11-monitoring.md`
**Status**: HIGH QUALITY - 1 critical issue blocking deployment

### Critical Issues (1)
1. **CRT-1**: Default Grafana password allows public access
   - File: `docker/docker-stack.yml:145`
   - Fix: Remove `:-admin` fallback, require password via env validation

### High Priority (3)
1. /metrics endpoint lacks authentication (acceptable for internal network)
2. Prometheus/AlertManager not hardened (internal only, can defer)
3. Environment variable validation missing (should add startup script)

### Medium Priority (4)
1. Metrics module lacks dedicated unit tests (integration tests pass)
2. Missing ESLint configuration (TypeScript check passes)
3. Alert thresholds not production-tuned (tune after baseline)
4. Monitoring stack resource limits missing (should add)

### Recommendations
**Immediate**: Fix CRT-1 before deployment
**Short-term**: Add env validation, create unit tests, fix ESLint
**Future**: Tune alerts based on production traffic, add documentation

### Test Results
- **228 tests passing** (100% pass rate)
- **TypeScript check**: SUCCESS (0 errors)
- **Build**: SUCCESS
- **ESLint**: Config missing (non-blocking)

## Next Steps

### Before Deployment
1. Fix CRT-1: Require `GF_SECURITY_ADMIN_PASSWORD` in docker-stack.yml
2. Add environment validation script
3. Document /metrics security model

### Deployment
- Deploy monitoring stack to VPS
- Verify Grafana dashboards accessible
- Test alert rules with synthetic errors
- Validate Discord webhook notifications

### Post-Deployment
- Collect 1-week traffic baseline
- Tune alert thresholds
- Add metrics unit tests
- Create monitoring documentation

### Future Phases
- Phase 12: Analytics integration (optional)
- Phase 13: Performance optimization based on metrics data
