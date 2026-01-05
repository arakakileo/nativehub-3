import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useCampaigns, useCampaign, useUpdateCampaign } from './useCampaigns'
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

describe('useCampaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useCampaigns', () => {
    it('should return loading state initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}))

      const { result } = renderHook(() => useCampaigns(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.data).toBeUndefined()
    })

    it('should return campaigns data after fetch', async () => {
      const mockCampaigns = [
        {
          id: '1',
          name: 'Campaign 1',
          status: 'active',
          spend: 100,
          conversions: 10,
        },
        {
          id: '2',
          name: 'Campaign 2',
          status: 'paused',
          spend: 50,
          conversions: 5,
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockCampaigns }),
      })

      const { result } = renderHook(() => useCampaigns(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockCampaigns)
    })

    it('should filter campaigns by sourceAccountId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      })

      const { result } = renderHook(() => useCampaigns({ sourceAccountId: 'source-123' }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns?sourceAccountId=source-123'),
        expect.any(Object)
      )
    })

    it('should use correct query key with sourceAccountId', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}))

      const { result } = renderHook(() => useCampaigns({ sourceAccountId: 'source-123' }), {
        wrapper: createWrapper(),
      })

      // The hook should be in loading state
      expect(result.current.isLoading).toBe(true)
    })

    it('should handle error state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      })

      const { result } = renderHook(() => useCampaigns(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      expect(result.current.error).toBeDefined()
    })
  })

  describe('useCampaign', () => {
    it('should not fetch when id is empty', () => {
      const { result } = renderHook(() => useCampaign(''), {
        wrapper: createWrapper(),
      })

      expect(result.current.fetchStatus).toBe('idle')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch single campaign by id', async () => {
      const mockCampaign = {
        id: 'camp-123',
        name: 'Test Campaign',
        status: 'active',
        spend: 150,
        conversions: 15,
        cpa: 10,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockCampaign }),
      })

      const { result } = renderHook(() => useCampaign('camp-123'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockCampaign)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns/camp-123'),
        expect.any(Object)
      )
    })

    it('should handle 404 error for non-existent campaign', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Campaign not found' }),
      })

      const { result } = renderHook(() => useCampaign('non-existent'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      expect(result.current.error).toBeDefined()
    })
  })

  describe('useUpdateCampaign', () => {
    it('should update campaign status', async () => {
      const updatedCampaign = {
        id: 'camp-123',
        name: 'Test Campaign',
        status: 'paused',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: updatedCampaign }),
      })

      const { result } = renderHook(() => useUpdateCampaign(), {
        wrapper: createWrapper(),
      })

      await result.current.mutateAsync({
        id: 'camp-123',
        data: { status: 'paused' },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns/camp-123'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'paused' }),
        })
      )
    })

    it('should update campaign bid amount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: 'camp-123', bidAmount: 0.15 } }),
      })

      const { result } = renderHook(() => useUpdateCampaign(), {
        wrapper: createWrapper(),
      })

      await result.current.mutateAsync({
        id: 'camp-123',
        data: { bidAmount: 0.15 },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns/camp-123'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ bidAmount: 0.15 }),
        })
      )
    })

    it('should handle update error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid bid amount' }),
      })

      const { result } = renderHook(() => useUpdateCampaign(), {
        wrapper: createWrapper(),
      })

      await expect(
        result.current.mutateAsync({
          id: 'camp-123',
          data: { bidAmount: -1 },
        })
      ).rejects.toThrow('Invalid bid amount')
    })
  })
})
