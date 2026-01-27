/**
 * Prometheus Metrics Middleware
 *
 * Collects HTTP request metrics:
 * - Request duration histogram
 * - Request count by route/method/status
 * - Active requests gauge
 * - Error counts
 */

import type { Context, Next } from 'hono'
import {
  httpRequestDuration,
  httpRequestsTotal,
  httpErrorsTotal,
  httpActiveRequests,
  normalizeRoute,
} from '../lib/metrics.js'

/**
 * Metrics collection middleware for Hono
 * Should be applied early in the middleware chain
 */
export async function metricsMiddleware(c: Context, next: Next): Promise<void> {
  // Skip metrics for the /metrics endpoint itself to avoid recursion
  if (c.req.path === '/metrics') {
    await next()
    return
  }

  const startTime = performance.now()
  const method = c.req.method

  // Increment active requests
  httpActiveRequests.inc()

  try {
    await next()

    // Calculate duration
    const duration = (performance.now() - startTime) / 1000
    const statusCode = c.res.status.toString()
    const route = normalizeRoute(c.req.path)

    // Record metrics
    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration)
    httpRequestsTotal.inc({ method, route, status_code: statusCode })

    // Track errors (4xx and 5xx)
    if (c.res.status >= 400) {
      const errorType = c.res.status >= 500 ? 'server_error' : 'client_error'
      httpErrorsTotal.inc({ method, route, error_type: errorType })
    }
  } catch (error) {
    // Record error metrics even if middleware throws
    const duration = (performance.now() - startTime) / 1000
    const route = normalizeRoute(c.req.path)

    httpRequestDuration.observe({ method, route, status_code: '500' }, duration)
    httpRequestsTotal.inc({ method, route, status_code: '500' })
    httpErrorsTotal.inc({ method, route, error_type: 'unhandled_error' })

    throw error
  } finally {
    // Decrement active requests
    httpActiveRequests.dec()
  }
}
