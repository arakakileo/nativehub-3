# Phase 11: Production Monitoring & Alerting - Implementation Summary

**Date**: January 3, 2026
**Status**: Complete
**Focus**: Prometheus metrics collection, Grafana dashboards, AlertManager integration

## Overview

Phase 11 establishes comprehensive production monitoring for NativeHub 3.0. Integrated Prometheus for metrics collection, Grafana for visualization, and AlertManager for incident notifications via Discord.

## Achievements

### 1. Prometheus Metrics Registry (`apps/api/src/lib/metrics.ts`)

Centralized metrics collection with prom-client library:

**HTTP Request Metrics**:
- `nativehub_http_request_duration_seconds` - Histogram (buckets: 0.01-10s)
- `nativehub_http_requests_total` - Counter by method/route/status
- `nativehub_http_errors_total` - Counter by method/route/error_type
- `nativehub_http_active_requests` - Gauge (current in-flight requests)

**Database Metrics**:
- `nativehub_db_query_duration_seconds` - Histogram (buckets: 0.001-1s)

**Job Queue Metrics**:
- `nativehub_jobs_processed_total` - Counter (by job_name/status)
- `nativehub_job_duration_seconds` - Histogram (buckets: 0.1-120s)

**System Metrics**:
- Node.js runtime metrics (memory, GC, event loop) with `nativehub_` prefix
- Application info gauge with version/node_version labels

**Route Normalization**:
- Dynamic path segments (UUIDs, numeric IDs) normalized to `:id`
- Prevents cardinality explosion in metric labels

### 2. Metrics Middleware (`apps/api/src/middleware/metrics.ts`)

Request timing and error tracking middleware for Hono:

**Implementation**:
```typescript
export async function metricsMiddleware(c: Context, next: Next)
```

**Features**:
- Performance timing via `performance.now()`
- Request duration histogram observation
- Request count increment
- Error tracking (4xx, 5xx, unhandled)
- Active requests gauge management
- Self-referential loop prevention (skips /metrics endpoint)

**Timing Accuracy**:
- High-resolution timer for sub-millisecond precision
- Captures duration before response sent
- Finally block ensures gauge decrement on error

### 3. Metrics Endpoint Integration (`apps/api/src/index.ts`)

Hono route handler for Prometheus scraping:

```typescript
app.get('/metrics', async (c) => {
  const metrics = await getMetrics()
  c.header('Content-Type', getMetricsContentType())
  return c.text(metrics)
})
```

**Scrape Target**: http://api:3001/metrics
**Port**: 3001 (internal Docker network)

### 4. Prometheus Configuration (`docker/prometheus/prometheus.yml`)

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'nativehub-api'
    static_configs:
      - targets: ['api:3001']
    metrics_path: /metrics
    scrape_interval: 15s
    scrape_timeout: 10s
```

**Retention**: 15 days
**Storage**: Volume mount `prometheus-data:/prometheus`

### 5. Alert Rules (`docker/prometheus/alert-rules.yml`)

**7 Alert Rules Configured**:

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| HighErrorRate | Error rate > 5% (5m avg) | Critical | Immediate notify |
| HighLatency | p95 latency > 1s | Warning | Standard notify |
| NativeHubApiDown | Service unreachable > 1m | Critical | Immediate notify |
| HighMemoryUsage | Heap > 80% for 5m | Warning | Standard notify |
| TooManyActiveRequests | Active requests > 100 for 1m | Warning | Standard notify |
| SlowDatabaseQueries | p95 DB latency > 0.5s for 5m | Warning | Standard notify |
| JobProcessingFailures | Job failure rate > 0.1/sec (15m) | Warning | Standard notify |

**Alert Routing**:
- Critical: 10s group wait, 1h repeat interval
- Warning: 1m group wait, 4h repeat interval
- Inhibition: Suppress non-critical when service down

### 6. AlertManager Configuration (`docker/alertmanager/alertmanager.yml`)

Discord webhook integration for notifications:

**Receivers**:
- `discord-critical`: Critical alerts with immediate delivery
- `discord-notifications`: Warning alerts with batching

**Routing**:
- Group by alertname + severity
- 30s default group wait (10s for critical)
- 5m group interval, 4h repeat (1h for critical)

**Feature**: Send resolved notifications when alert clears

### 7. Grafana Setup (`docker/grafana/provisioning/`)

Auto-provisioned monitoring dashboards:

**Datasource Configuration**:
- Prometheus at http://prometheus:9090
- UID: `prometheus`

**Dashboard**: `nativehub-overview.json`
- p50/p95/p99 request latency trends
- Request rate and error rate panels
- HTTP status code breakdown
- Active requests gauge
- Memory usage tracking
- Database query performance

**Access**: https://grafana-nativehub.arakakileo.com
**Auth**: GF_SECURITY_ADMIN_USER / GF_SECURITY_ADMIN_PASSWORD
**Config**: GF_USERS_ALLOW_SIGN_UP=false (locked to admin only)

### 8. Docker Compose Integration

**Services**:
```yaml
prometheus:
  image: prom/prometheus:v2.48.0
  volumes: [prometheus.yml, alert-rules.yml, prometheus-data]

alertmanager:
  image: prom/alertmanager:v0.26.0
  environment: DISCORD_WEBHOOK_URL
  volumes: [alertmanager.yml, alertmanager-data]

grafana:
  image: grafana/grafana:10.2.2
  volumes: [provisioning/, dashboards/, grafana-data]
  routes: traefik.http.routers.nativehub3-grafana
```

**Networks**:
- `monitoring`: Internal network for prometheus/alertmanager/api
- `traefik-public`: External access for Grafana via Traefik

**Environment Variables**:
- DISCORD_WEBHOOK_URL - Alert notifications
- GF_SECURITY_ADMIN_USER - Grafana login
- GF_SECURITY_ADMIN_PASSWORD - Grafana password

### 9. Dependencies

**Package Addition** (`apps/api/package.json`):
```json
{
  "prom-client": "^15.1.0"
}
```

## Monitoring Stack URLs (Production)

| Service | URL | Purpose |
|---------|-----|---------|
| **API Metrics** | http://api:3001/metrics | Prometheus scrape target |
| **Prometheus** | http://prometheus:9090 | Internal metric DB |
| **AlertManager** | http://alertmanager:9093 | Internal alert routing |
| **Grafana** | https://grafana-nativehub.arakakileo.com | Public dashboards |

## Key Metrics to Watch

**Performance Baselines** (from Lighthouse Phase 10):
- p50 latency: ~100ms
- p95 latency: <250ms (alert threshold: 1s)
- p99 latency: <500ms
- Error rate baseline: <0.1% (alert threshold: 5%)

**Capacity Thresholds**:
- Active requests: 100 concurrent (alert threshold)
- Memory: 80% heap usage (alert threshold)
- DB queries: p95 > 0.5s indicates need for indexing/optimization

## Environment Configuration

**Required Variables** (`.env.production`):
```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=${SECURE_PASSWORD}
```

## Deployment Checklist

- [x] Prometheus metrics registry initialized
- [x] Request timing middleware applied (early in chain)
- [x] /metrics endpoint exposed on port 3001
- [x] Prometheus scrape config targets API
- [x] 7 alert rules configured with appropriate thresholds
- [x] AlertManager routes to Discord webhooks
- [x] Grafana datasource provisioned
- [x] Overview dashboard deployed
- [x] Docker Compose services integrated
- [x] Environment variables documented

## Integration with Existing Stack

**API Integration**:
- Metrics middleware applied in `apps/api/src/index.ts`
- No breaking changes to existing endpoints
- Backward compatible (metrics are optional)

**Job Queue**:
- Ready for job metrics when pg-boss integration added
- Metrics hooks: `jobsProcessed`, `jobDuration`

**Traffic Sources**:
- API request metrics capture all source integrations
- Error metrics track API failures

**Database**:
- Query duration metrics ready for Drizzle instrumentation
- Enable via interceptors in future phase

## Testing Production Monitoring

**Check Metrics Collection**:
```bash
curl http://localhost:3001/metrics | grep nativehub_
```

**Trigger Alerts**:
1. High error rate: Hit endpoint multiple times with invalid data
2. High latency: Check p95 histogram spike
3. Memory: Monitor heap_size_used_bytes
4. Active requests: Send concurrent requests > 100

**Verify Discord Notifications**:
- Check Discord channel when alert fires
- Verify resolved message when condition clears
- Test inhibition rule (suppress when service down)

## Future Enhancements

- [ ] Custom business metrics (optimizations executed, blacklist rate)
- [ ] Database query instrumentation via Drizzle hooks
- [ ] Job queue metrics integration
- [ ] Request tracing (distributed tracing headers)
- [ ] SLI/SLO dashboards
- [ ] Cost optimization metrics
- [ ] Traffic source integration health metrics

## Related Documentation

- [System Architecture - Monitoring Section](./system-architecture.md#monitoring--observability)
- [Deployment Guide](./deployment-guide.md)
- [Code Standards](./code-standards.md)

---

**Phase 11 Author**: Claude Code
**Next Phase**: Phase 12 (TBD - Optimization metrics tracking)
