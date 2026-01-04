import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAuthStore } from './authStore'

// Mock the auth-client module
const mockSignIn = vi.fn()
const mockSignOut = vi.fn()
const mockGetSession = vi.fn()

vi.mock('../lib/auth-client', () => ({
  authClient: {
    signIn: {
      email: (...args: unknown[]) => mockSignIn(...args),
    },
    signOut: () => mockSignOut(),
    getSession: () => mockGetSession(),
  },
}))

describe('authStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
    })
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should have null user initially', () => {
      const { result } = renderHook(() => useAuthStore())
      expect(result.current.user).toBeNull()
    })

    it('should not be authenticated initially', () => {
      const { result } = renderHook(() => useAuthStore())
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should be loading initially (for session check)', () => {
      const { result } = renderHook(() => useAuthStore())
      expect(result.current.isLoading).toBe(true)
    })

    it('should have no error initially', () => {
      const { result } = renderHook(() => useAuthStore())
      expect(result.current.error).toBeNull()
    })
  })

  describe('login', () => {
    it('should set user on successful login', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      }

      mockSignIn.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.login('test@example.com', 'password123')
      })

      expect(result.current.user).toEqual(mockUser)
      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.isLoading).toBe(false)
    })

    it('should call authClient.signIn.email with credentials', async () => {
      mockSignIn.mockResolvedValue({
        data: { user: { id: '1' } },
        error: null,
      })

      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.login('test@example.com', 'password123')
      })

      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
    })

    it('should set error on failed login', async () => {
      mockSignIn.mockResolvedValue({
        data: null,
        error: { message: 'Invalid credentials' },
      })

      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        try {
          await result.current.login('test@example.com', 'wrong-password')
        } catch {
          // Expected to throw
        }
      })

      expect(result.current.error).toBe('Invalid credentials')
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should clear error on new login attempt', async () => {
      // Set an error first
      useAuthStore.setState({ error: 'Previous error' })

      mockSignIn.mockResolvedValue({
        data: { user: { id: '1' } },
        error: null,
      })

      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.login('test@example.com', 'password')
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('logout', () => {
    it('should clear user on logout', async () => {
      // Set authenticated state
      useAuthStore.setState({
        user: { id: '1', email: 'test@example.com' },
        isAuthenticated: true,
      })

      mockSignOut.mockResolvedValue(undefined)

      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.logout()
      })

      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should call authClient.signOut', async () => {
      mockSignOut.mockResolvedValue(undefined)

      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.logout()
      })

      expect(mockSignOut).toHaveBeenCalled()
    })
  })

  describe('checkSession', () => {
    it('should set user if session exists', async () => {
      const mockUser = {
        id: 'user-789',
        email: 'session@example.com',
      }

      mockGetSession.mockResolvedValue({
        data: { user: mockUser },
      })

      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.checkSession()
      })

      expect(result.current.user).toEqual(mockUser)
      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.isLoading).toBe(false)
    })

    it('should clear user if no session', async () => {
      mockGetSession.mockResolvedValue({
        data: null,
      })

      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.checkSession()
      })

      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.isLoading).toBe(false)
    })

    it('should handle session check error', async () => {
      mockGetSession.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.checkSession()
      })

      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('clearError', () => {
    it('should clear error', () => {
      useAuthStore.setState({ error: 'Some error' })

      const { result } = renderHook(() => useAuthStore())

      expect(result.current.error).toBe('Some error')

      act(() => {
        result.current.clearError()
      })

      expect(result.current.error).toBeNull()
    })
  })
})
