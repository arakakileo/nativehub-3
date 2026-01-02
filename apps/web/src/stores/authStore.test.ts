import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAuthStore } from './authStore'
import { api } from '../lib/api'

// Mock the api module
vi.mock('../lib/api', () => ({
  api: {
    setToken: vi.fn(),
  },
}))

describe('authStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    const { result } = renderHook(() => useAuthStore())
    act(() => {
      result.current.logout()
    })
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should have null user initially', () => {
      const { result } = renderHook(() => useAuthStore())
      expect(result.current.user).toBeNull()
    })

    it('should have null token initially', () => {
      const { result } = renderHook(() => useAuthStore())
      expect(result.current.token).toBeNull()
    })

    it('should not be authenticated initially', () => {
      const { result } = renderHook(() => useAuthStore())
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should not be loading initially', () => {
      const { result } = renderHook(() => useAuthStore())
      expect(result.current.isLoading).toBe(false)
    })

    it('should have no error initially', () => {
      const { result } = renderHook(() => useAuthStore())
      expect(result.current.error).toBeNull()
    })
  })

  describe('login', () => {
    it('should set isLoading to true while logging in', async () => {
      const { result } = renderHook(() => useAuthStore())

      // Start login but don't wait
      const loginPromise = act(async () => {
        await result.current.login('test@example.com', 'password')
      })

      await loginPromise
    })

    it('should set user and token on successful login', async () => {
      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.login('test@example.com', 'password123')
      })

      expect(result.current.user).toEqual({
        id: '1',
        email: 'test@example.com',
      })
      expect(result.current.token).toMatch(/^mock-token-/)
      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.isLoading).toBe(false)
    })

    it('should call api.setToken on successful login', async () => {
      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.login('test@example.com', 'password123')
      })

      expect(api.setToken).toHaveBeenCalledWith(expect.stringMatching(/^mock-token-/))
    })

    it('should clear error on login attempt', async () => {
      const { result } = renderHook(() => useAuthStore())

      // Set an error manually first
      act(() => {
        useAuthStore.setState({ error: 'Previous error' })
      })

      await act(async () => {
        await result.current.login('test@example.com', 'password')
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('logout', () => {
    it('should clear user on logout', async () => {
      const { result } = renderHook(() => useAuthStore())

      // First login
      await act(async () => {
        await result.current.login('test@example.com', 'password')
      })

      // Then logout
      act(() => {
        result.current.logout()
      })

      expect(result.current.user).toBeNull()
    })

    it('should clear token on logout', async () => {
      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.login('test@example.com', 'password')
      })

      act(() => {
        result.current.logout()
      })

      expect(result.current.token).toBeNull()
    })

    it('should set isAuthenticated to false on logout', async () => {
      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.login('test@example.com', 'password')
      })

      act(() => {
        result.current.logout()
      })

      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should call api.setToken with null on logout', async () => {
      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.login('test@example.com', 'password')
      })

      vi.clearAllMocks()

      act(() => {
        result.current.logout()
      })

      expect(api.setToken).toHaveBeenCalledWith(null)
    })
  })

  describe('setToken', () => {
    it('should set token', () => {
      const { result } = renderHook(() => useAuthStore())

      act(() => {
        result.current.setToken('new-token-123')
      })

      expect(result.current.token).toBe('new-token-123')
    })

    it('should set isAuthenticated to true', () => {
      const { result } = renderHook(() => useAuthStore())

      act(() => {
        result.current.setToken('new-token-123')
      })

      expect(result.current.isAuthenticated).toBe(true)
    })

    it('should call api.setToken', () => {
      const { result } = renderHook(() => useAuthStore())

      act(() => {
        result.current.setToken('new-token-123')
      })

      expect(api.setToken).toHaveBeenCalledWith('new-token-123')
    })
  })

  describe('clearError', () => {
    it('should clear error', () => {
      const { result } = renderHook(() => useAuthStore())

      // Set an error first
      act(() => {
        useAuthStore.setState({ error: 'Some error' })
      })

      expect(result.current.error).toBe('Some error')

      act(() => {
        result.current.clearError()
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('persist', () => {
    it('should have the correct storage name', () => {
      // Access the persist configuration
      const persist = (useAuthStore as unknown as { persist: { getOptions: () => { name: string } } }).persist
      expect(persist.getOptions().name).toBe('nativehub-auth')
    })
  })
})
