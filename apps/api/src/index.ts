import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { logger } from './lib/logger.js'
import { errorHandler } from './middleware/error-handler.js'
import { sourceAccountRoutes } from './routes/source-accounts.js'
import { campaignRoutes } from './routes/campaigns.js'
import { widgetRoutes } from './routes/widgets.js'
import { optimizerRoutes } from './routes/optimizer.js'
import { initJobs } from './jobs/index.js'

const app = new Hono()

// Global middleware
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}))
app.use('*', honoLogger())
app.onError(errorHandler)

// Health check
app.get('/health', (c) => c.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: '3.0.0'
}))

// API v1 routes
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
