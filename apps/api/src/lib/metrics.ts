/**
 * Prometheus Metrics Registry
 *
 * Exposes application metrics for monitoring:
 * - HTTP request duration, counts, errors
 * - Node.js runtime metrics (memory, GC, event loop)
 * - Custom business metrics
 */

import client from 'prom-client'

// Create a new registry to avoid conflicts with default metrics
export const register = new client.Registry()

// Add default Node.js metrics (memory, GC, event loop, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'nativehub_',
})

// HTTP Request Duration Histogram
// Labels: method, route, status_code
export const httpRequestDuration = new client.Histogram({
  name: 'nativehub_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
})

// HTTP Request Counter
// Labels: method, route, status_code
export const httpRequestsTotal = new client.Counter({
  name: 'nativehub_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
})

// HTTP Error Counter
// Labels: method, route, error_type
export const httpErrorsTotal = new client.Counter({
  name: 'nativehub_http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'route', 'error_type'],
  registers: [register],
})

// Active HTTP Requests Gauge
export const httpActiveRequests = new client.Gauge({
  name: 'nativehub_http_active_requests',
  help: 'Number of active HTTP requests',
  registers: [register],
})

// Database Query Duration Histogram
export const dbQueryDuration = new client.Histogram({
  name: 'nativehub_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
})

// Job Queue Metrics
export const jobsProcessed = new client.Counter({
  name: 'nativehub_jobs_processed_total',
  help: 'Total number of jobs processed',
  labelNames: ['job_name', 'status'],
  registers: [register],
})

export const jobDuration = new client.Histogram({
  name: 'nativehub_job_duration_seconds',
  help: 'Duration of job execution in seconds',
  labelNames: ['job_name'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
  registers: [register],
})

// Application Info Gauge (for version tracking)
export const appInfo = new client.Gauge({
  name: 'nativehub_app_info',
  help: 'Application information',
  labelNames: ['version', 'node_version'],
  registers: [register],
})

// Set app info on startup
appInfo.set({ version: '3.0.0', node_version: process.version }, 1)

// Helper to normalize route paths for low cardinality
// Replaces dynamic segments like /api/v1/campaigns/123 -> /api/v1/campaigns/:id
export function normalizeRoute(path: string): string {
  return path
    // UUID pattern
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '/:id'
    )
    // Numeric IDs
    .replace(/\/\d+/g, '/:id')
    // Remove query strings
    .replace(/\?.*$/, '')
}

// Get metrics as string for /metrics endpoint
export async function getMetrics(): Promise<string> {
  return register.metrics()
}

// Get metrics content type
export function getMetricsContentType(): string {
  return register.contentType
}
