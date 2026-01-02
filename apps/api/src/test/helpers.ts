import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './mocks/db.js'
import { sourceAccounts } from '../db/schema.js'
import { encryptCredentials } from '../lib/crypto.js'
import { TEST_USER_ID, TEST_USER_ID_2 } from './fixtures/index.js'
import type { AuthUser } from '../middleware/auth.js'

/**
 * Create a test client for making HTTP requests to a Hono app
 */
export function createTestClient(app: Hono) {
  return {
    get: async (path: string, options?: { headers?: Record<string, string> }) => {
      const res = await app.request(path, {
        method: 'GET',
        headers: options?.headers,
      })
      return {
        status: res.status,
        json: () => res.json(),
        text: () => res.text(),
      }
    },
    post: async (path: string, body?: unknown, options?: { headers?: Record<string, string> }) => {
      const res = await app.request(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      return {
        status: res.status,
        json: () => res.json(),
        text: () => res.text(),
      }
    },
    patch: async (path: string, body?: unknown, options?: { headers?: Record<string, string> }) => {
      const res = await app.request(path, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      return {
        status: res.status,
        json: () => res.json(),
        text: () => res.text(),
      }
    },
    delete: async (path: string, options?: { headers?: Record<string, string> }) => {
      const res = await app.request(path, {
        method: 'DELETE',
        headers: options?.headers,
      })
      return {
        status: res.status,
        json: () => res.json(),
        text: () => res.text(),
      }
    },
  }
}

/**
 * Create test app with mocked auth middleware
 * Injects user into context without Supabase validation
 */
export function createTestApp(user: AuthUser = { id: TEST_USER_ID, email: 'test@example.com' }) {
  const app = new Hono()

  // Add CORS like production
  app.use('*', cors())

  // Mock auth middleware - injects user without token validation
  app.use('*', async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing authorization header' }, 401)
    }
    c.set('user', user)
    await next()
  })

  return app
}

/**
 * Create authenticated request headers
 */
export function createAuthHeaders(token: string = 'test-token') {
  return {
    Authorization: `Bearer ${token}`,
  }
}

/**
 * Seed test source account
 */
export async function seedSourceAccount(overrides: {
  userId?: string
  sourceId?: string
  name?: string
  status?: string
} = {}) {
  const { encrypted, iv } = encryptCredentials({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
  })

  const [account] = await db.insert(sourceAccounts).values({
    userId: overrides.userId ?? TEST_USER_ID,
    sourceId: overrides.sourceId ?? 'revcontent',
    name: overrides.name ?? 'Test Account',
    credentialsEncrypted: encrypted,
    credentialsIv: iv,
    status: overrides.status ?? 'connected',
  }).returning()

  return account
}

/**
 * Seed multiple source accounts for testing
 */
export async function seedTestData() {
  const account1 = await seedSourceAccount({ name: 'Account 1' })
  const account2 = await seedSourceAccount({ name: 'Account 2', sourceId: 'taboola' })
  const otherUserAccount = await seedSourceAccount({
    userId: TEST_USER_ID_2,
    name: 'Other User Account',
  })

  return { account1, account2, otherUserAccount }
}

// Legacy exports for backwards compatibility
export const mockUser = {
  id: TEST_USER_ID,
  email: 'test@example.com',
}

export const mockSourceAccount = {
  id: 'test-account-id',
  userId: TEST_USER_ID,
  sourceId: 'revcontent' as const,
  name: 'Test Account',
  status: 'connected' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
}
