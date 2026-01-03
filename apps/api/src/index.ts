import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { logger } from './lib/logger.js'
import { trustedOrigins } from './lib/config.js'
import { errorHandler } from './middleware/error-handler.js'
import { sessionMiddleware } from './middleware/session.js'
import { authRateLimiter, apiRateLimiter } from './middleware/rate-limit.js'
import { authRoutes } from './routes/auth.js'
import { sourceAccountRoutes } from './routes/source-accounts.js'
import { campaignRoutes } from './routes/campaigns.js'
import { widgetRoutes } from './routes/widgets.js'
import { optimizerRoutes } from './routes/optimizer.js'
import { initJobs } from './jobs/index.js'
import { db } from './lib/db.js'
import { sql } from 'drizzle-orm'

const app = new Hono()

// Global middleware - logger and error handler
app.use('*', honoLogger())
app.onError(errorHandler)

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

// Health check (public) - verifies DB connectivity
app.get('/health', async (c) => {
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

app.route('/api/v1', apiV1)

const port = Number(process.env.PORT) || 3001

logger.info(`Starting NativeHub API v3.0.0 on port ${port}`)

serve({ fetch: app.fetch, port })

logger.info(`Server running on http://localhost:${port}`)

// Initialize background jobs
initJobs()

export { app }
