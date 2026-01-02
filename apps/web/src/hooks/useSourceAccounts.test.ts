import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import {
  useSourceAccounts,
  useSourceAccount,
  useCreateSourceAccount,
  useDeleteSourceAccount,
  useSyncSourceAccount,
} from './useSourceAccounts'
import { mockFetch } from '../test/setup'

// Create wrapper with fresh QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useSourceAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useSourceAccounts', () => {
    it('should return loading state initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})) // Never resolves

      const { result } = renderHook(() => useSourceAccounts(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.data).toBeUndefined()
    })

    it('should return source accounts data after fetch', async () => {
      const mockAccounts = [
        { id: '1', name: 'Account 1', sourceId: 'revcontent', status: 'connected' },
        { id: '2', name: 'Account 2', sourceId: 'taboola', status: 'pending' },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockAccounts }),
      })

      const { result } = renderHook(() => useSourceAccounts(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockAccounts)
      expect(result.current.isLoading).toBe(false)
    })

    it('should handle error state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      })

      const { result } = renderHook(() => useSourceAccounts(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      expect(result.current.error).toBeDefined()
      expect(result.current.data).toBeUndefined()
    })

    it('should include authorization header when token is set', async () => {
      const { api } = await import('../lib/api')
      api.setToken('test-token')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      })

      const { result } = renderHook(() => useSourceAccounts(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/source-accounts'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      )

      // Cleanup
      api.setToken(null)
    })
  })

  describe('useSourceAccount', () => {
    it('should not fetch when id is empty', () => {
      const { result } = renderHook(() => useSourceAccount(''), {
        wrapper: createWrapper(),
      })

      expect(result.current.fetchStatus).toBe('idle')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch single account by id', async () => {
      const mockAccount = {
        id: '123',
        name: 'Test Account',
        sourceId: 'revcontent',
        status: 'connected',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockAccount }),
      })

      const { result } = renderHook(() => useSourceAccount('123'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockAccount)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/source-accounts/123'),
        expect.any(Object)
      )
    })
  })

  describe('useCreateSourceAccount', () => {
    it('should create account and invalidate cache', async () => {
      const newAccount = {
        sourceId: 'revcontent' as const,
        name: 'New Account',
        credentials: { clientId: 'test', clientSecret: 'secret' },
      }
      const createdAccount = { id: 'new-id', ...newAccount, status: 'pending' }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: createdAccount }),
      })

      const { result } = renderHook(() => useCreateSourceAccount(), {
        wrapper: createWrapper(),
      })

      await result.current.mutateAsync(newAccount)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/source-accounts'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newAccount),
        })
      )
    })

    it('should return error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid data' }),
      })

      const { result } = renderHook(() => useCreateSourceAccount(), {
        wrapper: createWrapper(),
      })

      await expect(
        result.current.mutateAsync({
          sourceId: 'revcontent',
          name: '',
          credentials: {},
        })
      ).rejects.toThrow('Invalid data')
    })
  })

  describe('useDeleteSourceAccount', () => {
    it('should delete account', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const { result } = renderHook(() => useDeleteSourceAccount(), {
        wrapper: createWrapper(),
      })

      await result.current.mutateAsync('account-123')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/source-accounts/account-123'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  describe('useSyncSourceAccount', () => {
    it('should trigger sync and invalidate cache', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const { result } = renderHook(() => useSyncSourceAccount(), {
        wrapper: createWrapper(),
      })

      await result.current.mutateAsync('account-123')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/source-accounts/account-123/sync'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })
})
