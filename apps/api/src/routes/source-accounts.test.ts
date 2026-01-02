import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { sourceAccounts } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import {
  createTestClient,
  createTestApp,
  createAuthHeaders,
  seedSourceAccount,
} from '../test/helpers.js'
import { TEST_USER_ID, TEST_USER_ID_2 } from '../test/fixtures/index.js'

// Import route handler (without auth middleware - we add our own mock)
import { z } from 'zod'
import { validateBody } from '../middleware/validate.js'
import { sourceAccountService } from '../services/source-account.service.js'

// Recreate routes without original auth (we use mocked auth from createTestApp)
function createSourceAccountRoutes() {
  return new Hono()
    .get('/', async (c) => {
      const user = c.get('user')
      const accounts = await sourceAccountService.list(user.id)
      return c.json({ data: accounts })
    })
    .post('/', validateBody(z.object({
      sourceId: z.enum(['revcontent', 'taboola', 'outbrain', 'mgid']),
      name: z.string().min(1).max(100),
      clientId: z.string().min(1),
      clientSecret: z.string().optional(),
      accountId: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
    })), async (c) => {
      const user = c.get('user')
      const body = c.get('validatedBody') as {
        sourceId: 'revcontent' | 'taboola' | 'outbrain' | 'mgid'
        name: string
        clientId: string
        clientSecret?: string
        accountId?: string
        username?: string
        password?: string
      }
      const account = await sourceAccountService.create(user.id, body)
      return c.json({
        id: account.id,
        sourceId: account.sourceId,
        name: account.name,
        status: account.status,
        createdAt: account.createdAt,
      }, 201)
    })
    .get('/:id', async (c) => {
      const user = c.get('user')
      const id = c.req.param('id')
      const account = await sourceAccountService.get(user.id, id)
      if (!account) {
        return c.json({ error: 'Source account not found' }, 404)
      }
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
    .delete('/:id', async (c) => {
      const user = c.get('user')
      const id = c.req.param('id')
      try {
        await sourceAccountService.delete(user.id, id)
        return c.json({ success: true })
      } catch (error) {
        if (error instanceof Error && 'statusCode' in error) {
          return c.json({ success: true }) // Return success even if not found (idempotent delete)
        }
        throw error
      }
    })
}

describe('Source Accounts Routes - Integration', () => {
  let app: Hono
  let client: ReturnType<typeof createTestClient>

  beforeEach(() => {
    // Create test app with mocked auth
    app = createTestApp()
    app.route('/api/v1/source-accounts', createSourceAccountRoutes())
    client = createTestClient(app)
  })

  describe('GET /api/v1/source-accounts', () => {
    it('should return 401 without auth header', async () => {
      const res = await client.get('/api/v1/source-accounts')
      expect(res.status).toBe(401)
    })

    it('should return empty array for new user', async () => {
      const res = await client.get('/api/v1/source-accounts', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toEqual([])
    })

    it('should list only current user accounts', async () => {
      // Seed accounts for both users
      await seedSourceAccount({ name: 'My Account' })
      await seedSourceAccount({ userId: TEST_USER_ID_2, name: 'Other Account' })

      const res = await client.get('/api/v1/source-accounts', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].name).toBe('My Account')
    })

    it('should return multiple accounts for user', async () => {
      await seedSourceAccount({ name: 'Account 1' })
      await seedSourceAccount({ name: 'Account 2', sourceId: 'taboola' })

      const res = await client.get('/api/v1/source-accounts', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data).toHaveLength(2)
    })
  })

  describe('POST /api/v1/source-accounts', () => {
    it('should return 401 without auth header', async () => {
      const res = await client.post('/api/v1/source-accounts', {
        sourceId: 'revcontent',
        name: 'New Account',
        clientId: 'test-client-id',
      })
      expect(res.status).toBe(401)
    })

    it('should create account with valid data', async () => {
      const res = await client.post('/api/v1/source-accounts', {
        sourceId: 'revcontent',
        name: 'New Account',
        clientId: 'test-client-id',
        clientSecret: 'test-secret',
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.id).toBeDefined()
      expect(json.sourceId).toBe('revcontent')
      expect(json.name).toBe('New Account')
      expect(json.status).toBe('pending')

      // Verify in database
      const accounts = await db.select().from(sourceAccounts)
      expect(accounts).toHaveLength(1)
      expect(accounts[0].name).toBe('New Account')
    })

    it('should encrypt credentials', async () => {
      await client.post('/api/v1/source-accounts', {
        sourceId: 'revcontent',
        name: 'Encrypted Account',
        clientId: 'secret-client-id',
        clientSecret: 'super-secret',
      }, { headers: createAuthHeaders() })

      const accounts = await db.select().from(sourceAccounts)
      expect(accounts[0].credentialsEncrypted).toBeDefined()
      expect(accounts[0].credentialsIv).toBeDefined()
      // Credentials should be encrypted, not plain text
      expect(accounts[0].credentialsEncrypted).not.toContain('secret-client-id')
    })

    it('should return 400 for invalid sourceId', async () => {
      const res = await client.post('/api/v1/source-accounts', {
        sourceId: 'invalid-source',
        name: 'Bad Account',
        clientId: 'test-id',
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(400)
    })

    it('should return 400 for missing required fields', async () => {
      const res = await client.post('/api/v1/source-accounts', {
        sourceId: 'revcontent',
        // missing name and clientId
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(400)
    })

    it('should return 400 for empty name', async () => {
      const res = await client.post('/api/v1/source-accounts', {
        sourceId: 'revcontent',
        name: '',
        clientId: 'test-id',
      }, { headers: createAuthHeaders() })

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/v1/source-accounts/:id', () => {
    it('should return 404 for non-existent account', async () => {
      const res = await client.get('/api/v1/source-accounts/00000000-0000-0000-0000-000000000000', {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(404)
    })

    it('should return account by id', async () => {
      const account = await seedSourceAccount({ name: 'My Account' })

      const res = await client.get(`/api/v1/source-accounts/${account.id}`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.id).toBe(account.id)
      expect(json.data.name).toBe('My Account')
      expect(json.data.sourceId).toBe('revcontent')
    })

    it('should return 404 for other user account', async () => {
      const otherAccount = await seedSourceAccount({
        userId: TEST_USER_ID_2,
        name: 'Other Account',
      })

      const res = await client.get(`/api/v1/source-accounts/${otherAccount.id}`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(404)
    })

    it('should not expose credentials in response', async () => {
      const account = await seedSourceAccount()

      const res = await client.get(`/api/v1/source-accounts/${account.id}`, {
        headers: createAuthHeaders(),
      })
      const json = await res.json()

      // Should not contain any credential fields
      expect(json.data.credentialsEncrypted).toBeUndefined()
      expect(json.data.credentialsIv).toBeUndefined()
      expect(json.data.accessToken).toBeUndefined()
      expect(json.data.refreshToken).toBeUndefined()
    })
  })

  describe('DELETE /api/v1/source-accounts/:id', () => {
    it('should return 401 without auth header', async () => {
      const res = await client.delete('/api/v1/source-accounts/some-id')
      expect(res.status).toBe(401)
    })

    it('should delete account and return success', async () => {
      const account = await seedSourceAccount()

      const res = await client.delete(`/api/v1/source-accounts/${account.id}`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)

      // Verify deleted from database
      const accounts = await db.select().from(sourceAccounts).where(eq(sourceAccounts.id, account.id))
      expect(accounts).toHaveLength(0)
    })

    it('should only delete own account', async () => {
      const otherAccount = await seedSourceAccount({
        userId: TEST_USER_ID_2,
        name: 'Other Account',
      })

      // This should effectively do nothing (no error but no deletion either)
      const res = await client.delete(`/api/v1/source-accounts/${otherAccount.id}`, {
        headers: createAuthHeaders(),
      })
      expect(res.status).toBe(200)

      // Account should still exist
      const accounts = await db.select().from(sourceAccounts).where(eq(sourceAccounts.id, otherAccount.id))
      expect(accounts).toHaveLength(1)
    })

    it('should handle non-existent account gracefully', async () => {
      const res = await client.delete('/api/v1/source-accounts/00000000-0000-0000-0000-000000000000', {
        headers: createAuthHeaders(),
      })
      // Should return success even if nothing deleted
      expect(res.status).toBe(200)
    })
  })
})
