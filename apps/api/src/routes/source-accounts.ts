import { Hono } from 'hono'
import { z } from 'zod'
import { validateBody } from '../middleware/validate.js'
import { sourceAccountService } from '../services/source-account.service.js'
import { logger } from '../lib/logger.js'

// Validation schemas
const CreateAccountSchema = z.object({
  sourceId: z.enum(['revcontent', 'taboola', 'outbrain', 'mgid']),
  name: z.string().min(1).max(100),
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
  accountId: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
})

// Note: sessionMiddleware is applied globally in index.ts for all /api/v1/* routes
export const sourceAccountRoutes = new Hono()
  // List all source accounts
  .get('/', async (c) => {
    const userId = c.get('userId')
    const accounts = await sourceAccountService.list(userId)
    return c.json({ data: accounts })
  })

  // Create a new source account
  .post('/', validateBody(CreateAccountSchema), async (c) => {
    const userId = c.get('userId')
    const body = c.get('validatedBody') as z.infer<typeof CreateAccountSchema>

    const account = await sourceAccountService.create(userId, body)

    return c.json({
      id: account.id,
      sourceId: account.sourceId,
      name: account.name,
      status: account.status,
      createdAt: account.createdAt,
    }, 201)
  })

  // Get a single source account
  .get('/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')

    const account = await sourceAccountService.get(userId, id)
    if (!account) {
      return c.json({ error: 'Source account not found' }, 404)
    }

    // Don't expose sensitive fields
    return c.json({
      data: {
        id: account.id,
        sourceId: account.sourceId,
        name: account.name,
        externalAccountId: account.externalAccountId,
        status: account.status,
        lastSyncAt: account.lastSyncAt,
        lastError: account.lastError,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      }
    })
  })

  // Test connection to traffic source
  .post('/:id/test', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')

    const result = await sourceAccountService.getWithCredentials(userId, id)
    if (!result) {
      return c.json({ error: 'Source account not found' }, 404)
    }

    const { account, credentials } = result

    try {
      // TODO: Implement actual traffic source authentication
      // const trafficSource = createTrafficSource(account.sourceId)
      // const authResult = await trafficSource.authenticate(credentials)

      logger.info({ accountId: id, sourceId: account.sourceId }, 'Testing connection')

      // For now, just mark as connected (will be replaced with actual auth)
      await sourceAccountService.updateConnectionStatus(id, 'connected', {
        // accessToken: authResult.accessToken,
        // refreshToken: authResult.refreshToken,
        // tokenExpiresAt: new Date(Date.now() + authResult.expiresIn * 1000),
      })

      return c.json({ success: true, message: 'Connection test pending implementation' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      await sourceAccountService.updateConnectionStatus(id, 'error', {
        error: message,
      })

      return c.json({ success: false, error: message }, 400)
    }
  })

  // Delete a source account
  .delete('/:id', async (c) => {
    const userId = c.get('userId')
    const id = c.req.param('id')

    await sourceAccountService.delete(userId, id)
    return c.json({ success: true })
  })
