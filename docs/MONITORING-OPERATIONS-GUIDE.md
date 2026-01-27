# Monitoring Operations Guide - NativeHub 3.0

**Phase**: 11 (Production Monitoring & Alerting)
**Last Updated**: January 3, 2026

## Table of Contents

1. [Overview](#overview)
2. [Accessing Monitoring Tools](#accessing-monitoring-tools)
3. [Understanding Metrics](#understanding-metrics)
4. [Alert Configuration](#alert-configuration)
5. [Common Operations](#common-operations)
6. [Troubleshooting](#troubleshooting)
7. [Performance Baselines](#performance-baselines)

---

## Overview

NativeHub 3.0 uses a production-grade monitoring stack:

- **Prometheus** - Metrics collection & storage (15-day retention)
- **AlertManager** - Alert routing & grouping
- **Grafana** - Dashboards & visualization
- **Discord** - Alert notifications

Metrics flow: API → Prometheus (15s scrape) → AlertManager (15s eval) → Discord

---

## Accessing Monitoring Tools

### Grafana Dashboards (Public)

**URL**: https://grafana-nativehub.arakakileo.com

**Credentials**:
- Username: `${GF_SECURITY_ADMIN_USER}` (from .env)
- Password: `${GF_SECURITY_ADMIN_PASSWORD}` (from .env)

**Default Dashboard**: NativeHub Overview
- p50/p95/p99 request latency
- Request rate and error rate
- HTTP status distribution
- Active requests gauge
- Memory and GC metrics

### Prometheus UI (Internal)

**URL**: http://prometheus:9090 (internal Docker network)

**Usage**:
- Query metrics using PromQL
- View scrape targets and status
- View configured rules

**Example Queries**:
```promql
# Request rate (requests/second)
rate(nativehub_http_requests_total[5m])

# Error rate percentage
sum(rate(nativehub_http_errors_total[5m])) / sum(rate(nativehub_http_requests_total[5m]))

# 95th percentile latency
histogram_quantile(0.95, sum(rate(nativehub_http_request_duration_seconds_bucket[5m])) by (le))

# Memory usage percentage
(nativehub_nodejs_heap_size_used_bytes / nativehub_nodejs_heap_size_total_bytes) * 100

# Active concurrent requests
nativehub_http_active_requests
```

### AlertManager UI (Internal)

**URL**: http://alertmanager:9093 (internal Docker network)

**Features**:
- View active alerts
- View alert history
- Manually silence alerts
- Test webhook integration

---

## Understanding Metrics

### HTTP Request Metrics

#### Duration (Latency)

**Metric**: `nativehub_http_request_duration_seconds`

- **Type**: Histogram
- **Labels**: method, route, status_code
- **Buckets**: 0.01s, 0.05s, 0.1s, 0.25s, 0.5s, 1s, 2.5s, 5s, 10s
- **Use**: Track response time by endpoint

**Baseline** (from Lighthouse Phase 10):
- p50: ~100ms
- p95: <250ms
- p99: <500ms

**Alert Threshold**: p95 > 1s (warning)

#### Request Count

**Metric**: `nativehub_http_requests_total`

- **Type**: Counter
- **Labels**: method, route, status_code
- **Use**: Measure throughput

#### Error Tracking

**Metrics**:
- `nativehub_http_errors_total` - Errors by method/route/error_type
- **Error Types**: 'client_error' (4xx), 'server_error' (5xx), 'unhandled_error'

**Alert Threshold**: Error rate > 5% (critical)

#### Active Requests

**Metric**: `nativehub_http_active_requests`

- **Type**: Gauge
- **Use**: Monitor concurrent load

**Alert Threshold**: > 100 concurrent (warning)

### System Metrics

**Memory**:
- `nativehub_nodejs_heap_size_used_bytes` - Current heap usage
- `nativehub_nodejs_heap_size_total_bytes` - Total heap size
- **Alert**: Heap > 80% for 5m

**Garbage Collection**:
- `nativehub_nodejs_gc_duration_seconds` - GC pause time
- `nativehub_nodejs_gc_count` - GC event count

**Event Loop**:
- `nativehub_nodejs_eventloop_lag_seconds` - Event loop delay
- Indicates if Node is blocked

### Application Info

**Metric**: `nativehub_app_info`

- **Labels**: version, node_version
- **Value**: Always 1
- **Use**: Track what version is deployed

---

## Alert Configuration

### Alert Rules Overview

All 7 alert rules defined in `/docker/prometheus/alert-rules.yml`:

| Rule | Severity | Duration | Action |
|------|----------|----------|--------|
| HighErrorRate | critical | 2m | Notify immediately |
| HighLatency | warning | 2m | Notify (1m delay) |
| NativeHubApiDown | critical | 1m | Notify immediately |
| HighMemoryUsage | warning | 5m | Notify (1m delay) |
| TooManyActiveRequests | warning | 1m | Notify (1m delay) |
| SlowDatabaseQueries | warning | 5m | Notify (1m delay) |
| JobProcessingFailures | warning | 5m | Notify (1m delay) |

### Discord Notifications

**Receiver Config** (`/docker/alertmanager/alertmanager.yml`):

```yaml
receivers:
  - name: 'discord-critical'
    webhook_configs:
      - url: ${DISCORD_WEBHOOK_URL}
        send_resolved: true
```

**Alert Routing**:
- Critical alerts: 10s group wait, 1h repeat
- Warning alerts: 1m group wait, 4h repeat

**Inhibition Rules**:
When `NativeHubApiDown` fires, suppress:
- `HighErrorRate`
- `HighLatency`

(Prevents alert spam when service is down)

### Adding Custom Alerts

1. Edit `/docker/prometheus/alert-rules.yml`
2. Add new rule block:

```yaml
- alert: CustomAlertName
  expr: <prometheus_expression>
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Alert title"
    description: "{{ $value }} - Threshold: X"
```

3. Reload Prometheus:
   ```bash
   curl -X POST http://localhost:9090/-/reload
   ```

---

## Common Operations

### Check Metrics Endpoint

```bash
# Test metrics endpoint
curl http://localhost:3001/metrics | head -20

# Count available metrics
curl -s http://localhost:3001/metrics | grep "^nativehub_" | wc -l
```

### Query Recent Alerts

Access Prometheus UI (http://prometheus:9090):
1. Click "Alerts" tab
2. View active, pending, and firing alerts
3. Inspect alert expressions and time windows

### View Alert History

Access AlertManager UI (http://alertmanager:9093):
1. Click "Alerts" to see active
2. Scroll down for resolved alerts
3. Use date/time filters for historical view

### Silence an Alert Manually

AlertManager UI → Click alert → "Silence for 1h"

**Use Cases**:
- During maintenance windows
- During expected deployments
- For testing alert systems

### Test Discord Webhook

```bash
curl -X POST ${DISCORD_WEBHOOK_URL} \
  -H 'Content-Type: application/json' \
  -d '{
    "content": "Test alert from NativeHub monitoring"
  }'
```

### View Prometheus Config

```bash
# Check running configuration
curl http://localhost:9090/api/v1/status/config | jq .data

# Validate new config file
promtool check config /path/to/prometheus.yml
```

### Reload Prometheus (Zero Downtime)

```bash
# After editing prometheus.yml or alert-rules.yml
curl -X POST http://localhost:9090/-/reload

# Verify with ALERTS metric
curl -s http://localhost:9090/api/v1/query?query=ALERTS | jq .
```

### Export Metrics for Analysis

```bash
# Export range (24 hours ago to now)
curl -G 'http://localhost:9090/api/v1/query_range' \
  --data-urlencode 'query=nativehub_http_request_duration_seconds' \
  --data-urlencode 'start=<unix_timestamp_24h_ago>' \
  --data-urlencode 'end=<unix_timestamp_now>' \
  --data-urlencode 'step=300' > metrics.json
```

---

## Troubleshooting

### Metrics Not Collecting

**Check 1**: API metrics endpoint responding?
```bash
curl http://localhost:3001/metrics
```

**Check 2**: Prometheus scrape job status
- Visit http://prometheus:9090/targets
- Look for `nativehub-api` job
- Status should be "UP"

**Check 3**: Metrics middleware applied?
- Verify `metricsMiddleware` in `apps/api/src/index.ts`
- Should be early in middleware chain

### Alerts Not Firing

**Check 1**: Alert rules loaded?
```bash
curl http://localhost:9090/api/v1/rules | jq .data.groups
```

**Check 2**: Discord webhook URL valid?
- Test webhook manually (see above)
- Check AlertManager logs: `docker logs alertmanager`

**Check 3**: Alert condition being met?
- Query PromQL expression directly in Prometheus UI
- Verify evaluation interval (15s)

### High Memory Usage

**Diagnosis**:
1. Check heap gauge: `nativehub_nodejs_heap_size_used_bytes`
2. Check GC frequency: `rate(nativehub_nodejs_gc_count[5m])`
3. Check for memory leaks (heap growing without GC)

**Actions**:
1. Check for request volume spike
2. Review database query counts
3. Monitor traffic sources integration
4. Consider vertical scaling

### Slow Database Queries

**Diagnosis**:
1. Query `nativehub_db_query_duration_seconds` histogram
2. Check p95 latency (alert threshold: 0.5s)
3. Identify slow operations by table label

**Actions**:
1. Add indexes to frequently filtered columns
2. Review query patterns (N+1 queries?)
3. Consider caching frequently accessed data
4. Profile database with EXPLAIN ANALYZE

### Cascade Failures (Multiple Alerts)

**Normal**:
- Service down → triggers NativeHubApiDown
- Inhibition rule suppresses HighErrorRate, HighLatency
- Single critical alert in Discord

**Problem**: Multiple distinct alerts firing
- Indicates specific component failures
- Review individual metric trends
- Check correlation across services

---

## Performance Baselines

### API Response Times (Phase 10 Baseline)

| Percentile | Baseline | Alert Threshold |
|-----------|----------|-----------------|
| p50 | 100ms | N/A |
| p95 | 250ms | 1000ms |
| p99 | 500ms | N/A |

### Error Rate

| Level | Baseline | Alert Threshold |
|-------|----------|-----------------|
| 4xx | <0.1% | N/A |
| 5xx | ~0% | 5% (5m avg) |

### Capacity Metrics

| Metric | Baseline | Alert Threshold |
|--------|----------|-----------------|
| Active Requests | 10-50 | 100 |
| Memory (Heap) | 40-60% | 80% |
| GC Pause | <10ms | N/A |

### Expected Metric Values (Idle)

```
nativehub_http_active_requests = 0
nativehub_http_requests_total = rate(5m) ~1-2 requests/sec (health checks)
nativehub_nodejs_heap_size_used_bytes = 40-80MB
nativehub_nodejs_gc_duration_seconds = <10ms per event
```

---

## Integration Points

### With Job Queue (Phase 07)

Ready to instrument when job metrics integrated:
- `nativehub_jobs_processed_total` - Counter for completed jobs
- `nativehub_job_duration_seconds` - Histogram for job execution time

### With Database Instrumentation

Ready for Drizzle query hooks:
- `nativehub_db_query_duration_seconds` - Currently defined, awaiting integration

### With Business Metrics

Ready for custom counters:
- Optimizations executed
- Campaigns synced
- Blacklist actions taken

---

## Maintenance Tasks

### Daily

- Check Grafana dashboard for anomalies
- Review Discord alert notifications
- Verify no sustained high memory/CPU

### Weekly

- Export metrics for trend analysis
- Review alert rule thresholds vs actual baseline
- Check data retention (Prometheus 15-day)

### Monthly

- Analyze alert accuracy (false positives)
- Review performance trends
- Plan capacity scaling if needed
- Update baselines if thresholds drift

---

## Related Documentation

- [Phase 11 Summary](./PHASE-11-SUMMARY.md) - Implementation details
- [System Architecture](./system-architecture.md#monitoring--observability) - Monitoring design
- [Deployment Guide](./deployment-guide.md) - Docker stack setup

---

**Last Updated**: January 3, 2026
**Maintained By**: Development Team
**Next Review**: Phase 12+ (Custom metrics integration)
