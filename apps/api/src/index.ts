import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { logger } from './lib/logger.js'
import { trustedOrigins } from './lib/config.js'
import { errorHandler } from './middleware/error-handler.js'
import { sessionMiddleware } from './middleware/session.js'
import { authRateLimiter, apiRateLimiter } from './middleware/rate-limit.js'
import { metricsMiddleware } from './middleware/metrics.js'
import { getMetrics, getMetricsContentType } from './lib/metrics.js'
import { authRoutes } from './routes/auth.js'
import { sourceAccountRoutes } from './routes/source-accounts.js'
import { campaignRoutes } from './routes/campaigns.js'
import { widgetRoutes } from './routes/widgets.js'
import { optimizerRoutes } from './routes/optimizer.js'
import { jobRoutes } from './routes/jobs.js'
import { initJobs, stopJobQueue } from './jobs/index.js'
import { db } from './lib/db.js'
import { sql } from 'drizzle-orm'

const app = new Hono()

// Graceful shutdown state
let isShuttingDown = false

// Global middleware - metrics, logger and error handler
app.use('*', metricsMiddleware)
app.use('*', honoLogger())
app.onError(errorHandler)

// Prometheus metrics endpoint (internal only, no auth required)
app.get('/metrics', async (c) => {
  const metrics = await getMetrics()
  return c.text(metrics, 200, {
    'Content-Type': getMetricsContentType(),
  })
})

// CORS for auth routes (must be before auth handler)
app.use('/api/auth/*', cors({
  origin: trustedOrigins,
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
}))

// Rate limiting for auth routes (stricter)
app.use('/api/auth/*', authRateLimiter)

// Mount auth routes (public)
app.route('/api/auth', authRoutes)

// CORS for API v1 routes
app.use('/api/v1/*', cors({
  origin: trustedOrigins,
  credentials: true,
}))

// Rate limiting for API routes (more permissive)
app.use('/api/v1/*', apiRateLimiter)

// Apply session middleware to all API v1 routes (protected)
app.use('/api/v1/*', sessionMiddleware)

// Health check (public) - verifies DB connectivity and respects shutdown state
app.get('/health', async (c) => {
  if (isShuttingDown) {
    return c.json({
      status: 'shutting_down',
      timestamp: new Date().toISOString(),
      version: '3.0.0',
    }, 503)
  }

  try {
    await db.execute(sql`SELECT 1`)
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      database: 'connected',
    })
  } catch (error) {
    return c.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 503)
  }
})

// API v1 routes (all protected by sessionMiddleware)
const apiV1 = new Hono()
  .route('/source-accounts', sourceAccountRoutes)
  .route('/campaigns', campaignRoutes)
  .route('/widgets', widgetRoutes)
  .route('/optimizer', optimizerRoutes)
  .route('/jobs', jobRoutes)

app.route('/api/v1', apiV1)

const port = Number(process.env['PORT']) || 3001

logger.info(`Starting NativeHub API v3.0.0 on port ${port}`)

serve({ fetch: app.fetch, port })

logger.info(`Server running on http://localhost:${port}`)

// Initialize background jobs (async)
initJobs().catch((error) => {
  logger.error({ error }, 'Failed to initialize jobs')
})

// Graceful shutdown handler
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received')
  isShuttingDown = true

  // Force exit after 30 seconds
  const forceExitTimeout = setTimeout(() => {
    logger.error('Force exit after timeout')
    process.exit(1)
  }, 30000)

  try {
    await stopJobQueue()
    logger.info('Shutdown complete')
    clearTimeout(forceExitTimeout)
    process.exit(0)
  } catch (error) {
    logger.error({ error }, 'Error during shutdown')
    clearTimeout(forceExitTimeout)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export { app }
