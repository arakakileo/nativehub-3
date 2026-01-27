import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// Mock the auth module
const mockGetSession = vi.fn()

vi.mock('../auth.js', () => ({
  auth: {
    api: {
      getSession: (opts: { headers: Headers }) => mockGetSession(opts),
    },
  },
}))

// Import session middleware after mocking
const { sessionMiddleware, optionalSessionMiddleware } = await import('./session.js')

describe('sessionMiddleware', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockReset()

    app = new Hono()
    app.use('*', sessionMiddleware)
    app.get('/protected', (c) => {
      const user = c.get('user')
      const userId = c.get('userId')
      return c.json({ user, userId })
    })
  })

  it('should return 401 when no session', async () => {
    mockGetSession.mockResolvedValue(null)

    const res = await app.request('/protected')

    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('should set user and userId in context when session exists', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockGetSession.mockResolvedValue({
      user: mockUser,
      session: {
        id: 'session-123',
        token: 'token-abc',
        expiresAt: new Date(Date.now() + 3600000),
      },
    })

    const res = await app.request('/protected')

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.user.id).toBe('user-123')
    expect(json.user.email).toBe('test@example.com')
    expect(json.userId).toBe('user-123')
  })

  it('should pass headers to auth.api.getSession', async () => {
    mockGetSession.mockResolvedValue(null)

    await app.request('/protected', {
      headers: {
        Cookie: 'nativehub.session_token=test-token',
        'User-Agent': 'Test Agent',
      },
    })

    expect(mockGetSession).toHaveBeenCalledTimes(1)
    expect(mockGetSession).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    )
  })
})

describe('optionalSessionMiddleware', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockReset()

    app = new Hono()
    app.use('*', optionalSessionMiddleware)
    app.get('/public', (c) => {
      const user = c.get('user')
      const userId = c.get('userId')
      return c.json({ user: user || null, userId: userId || null })
    })
  })

  it('should allow request without session', async () => {
    mockGetSession.mockResolvedValue(null)

    const res = await app.request('/public')

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.user).toBeNull()
    expect(json.userId).toBeNull()
  })

  it('should set user if session exists', async () => {
    const mockUser = {
      id: 'user-456',
      email: 'optional@example.com',
      name: 'Optional User',
    }

    mockGetSession.mockResolvedValue({
      user: mockUser,
      session: { id: 'session-456' },
    })

    const res = await app.request('/public')

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.user.id).toBe('user-456')
    expect(json.userId).toBe('user-456')
  })
})
