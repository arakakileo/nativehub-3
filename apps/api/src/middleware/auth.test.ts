import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// Mock Supabase before importing the module
const mockGetUser = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}))

// Set env vars before importing auth module
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

// Now import auth module
const { authMiddleware } = await import('./auth.js')

describe('authMiddleware', () => {
  let app: Hono

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    mockGetUser.mockReset()

    // Create app with auth middleware
    app = new Hono()
    app.use('*', authMiddleware)
    app.get('/protected', (c) => {
      const user = c.get('user')
      return c.json({ userId: user.id })
    })
  })

  it('should return 401 when no Authorization header', async () => {
    const res = await app.request('/protected')

    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Missing authorization header')
  })

  it('should return 401 when Authorization header is not Bearer', async () => {
    const res = await app.request('/protected', {
      headers: { Authorization: 'Basic abc123' },
    })

    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Missing authorization header')
  })

  it('should return 401 when token is invalid', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    })

    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer invalid-token' },
    })

    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Invalid token')
  })

  it('should set user in context when token is valid', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'authenticated',
        },
      },
      error: null,
    })

    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer valid-token' },
    })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.userId).toBe('user-123')
  })

  it('should call supabase with the token', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      },
      error: null,
    })

    await app.request('/protected', {
      headers: { Authorization: 'Bearer my-jwt-token' },
    })

    expect(mockGetUser).toHaveBeenCalledWith('my-jwt-token')
  })

  it('should return 401 when supabase throws error', async () => {
    mockGetUser.mockRejectedValue(new Error('Network error'))

    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer some-token' },
    })

    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Authentication failed')
  })
})
