import { Hono } from 'hono'

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

export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
}

export const mockSourceAccount = {
  id: 'test-account-id',
  userId: 'test-user-id',
  sourceId: 'revcontent' as const,
  name: 'Test Account',
  status: 'connected' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
}
