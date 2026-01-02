import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import {
  useOptimizerRules,
  useCreateOptimizerRule,
  useUpdateOptimizerRule,
  useDeleteOptimizerRule,
  useOptimizerActions,
  useRunOptimizer,
} from './useOptimizer'
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

describe('useOptimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useOptimizerRules', () => {
    it('should return loading state initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}))

      const { result } = renderHook(() => useOptimizerRules(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.data).toBeUndefined()
    })

    it('should return optimizer rules after fetch', async () => {
      const mockRules = [
        {
          id: '1',
          name: 'Blacklist No Conversions',
          templateId: 'blacklist_no_conv',
          isActive: true,
        },
        {
          id: '2',
          name: 'Raise Bid Good CPA',
          templateId: 'raise_bid_good_cpa',
          isActive: true,
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockRules }),
      })

      const { result } = renderHook(() => useOptimizerRules(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockRules)
    })

    it('should handle error state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      })

      const { result } = renderHook(() => useOptimizerRules(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      expect(result.current.error).toBeDefined()
    })
  })

  describe('useCreateOptimizerRule', () => {
    it('should create a new rule', async () => {
      const newRule = {
        name: 'New Rule',
        templateId: 'blacklist_no_conv',
        conditions: { spend: { gte: 50 } },
        actions: [{ type: 'blacklist' }],
        isActive: true,
      }
      const createdRule = { id: 'new-id', ...newRule, createdAt: '2026-01-02' }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: createdRule }),
      })

      const { result } = renderHook(() => useCreateOptimizerRule(), {
        wrapper: createWrapper(),
      })

      await result.current.mutateAsync(newRule)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/optimizer/rules'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newRule),
        })
      )
    })

    it('should handle creation error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid rule configuration' }),
      })

      const { result } = renderHook(() => useCreateOptimizerRule(), {
        wrapper: createWrapper(),
      })

      await expect(
        result.current.mutateAsync({
          name: '',
          conditions: {},
          actions: [],
          isActive: false,
        })
      ).rejects.toThrow('Invalid rule configuration')
    })
  })

  describe('useUpdateOptimizerRule', () => {
    it('should update rule', async () => {
      const updatedRule = {
        id: 'rule-123',
        name: 'Updated Rule',
        isActive: false,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: updatedRule }),
      })

      const { result } = renderHook(() => useUpdateOptimizerRule(), {
        wrapper: createWrapper(),
      })

      await result.current.mutateAsync({
        id: 'rule-123',
        data: { isActive: false },
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/optimizer/rules/rule-123'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isActive: false }),
        })
      )
    })
  })

  describe('useDeleteOptimizerRule', () => {
    it('should delete rule', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const { result } = renderHook(() => useDeleteOptimizerRule(), {
        wrapper: createWrapper(),
      })

      await result.current.mutateAsync('rule-123')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/optimizer/rules/rule-123'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    it('should handle delete error for non-existent rule', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Rule not found' }),
      })

      const { result } = renderHook(() => useDeleteOptimizerRule(), {
        wrapper: createWrapper(),
      })

      await expect(result.current.mutateAsync('non-existent')).rejects.toThrow(
        'Rule not found'
      )
    })
  })

  describe('useOptimizerActions', () => {
    it('should return action history', async () => {
      const mockActions = [
        {
          id: '1',
          ruleId: 'rule-1',
          actionType: 'blacklist',
          targetType: 'widget',
          targetId: 'widget-1',
          status: 'executed',
          executedAt: '2026-01-02T10:00:00Z',
        },
        {
          id: '2',
          ruleId: 'rule-2',
          actionType: 'bid_decrease',
          targetType: 'widget',
          targetId: 'widget-2',
          status: 'pending',
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockActions }),
      })

      const { result } = renderHook(() => useOptimizerActions(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual(mockActions)
    })

    it('should handle empty action history', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      })

      const { result } = renderHook(() => useOptimizerActions(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual([])
    })
  })

  describe('useRunOptimizer', () => {
    it('should run optimizer and return actions count', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ actionsCount: 5 }),
      })

      const { result } = renderHook(() => useRunOptimizer(), {
        wrapper: createWrapper(),
      })

      const response = await result.current.mutateAsync()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/optimizer/run'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(response).toEqual({ actionsCount: 5 })
    })

    it('should handle optimizer run with no actions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ actionsCount: 0 }),
      })

      const { result } = renderHook(() => useRunOptimizer(), {
        wrapper: createWrapper(),
      })

      const response = await result.current.mutateAsync()

      expect(response).toEqual({ actionsCount: 0 })
    })

    it('should handle optimizer run error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'Optimizer service unavailable' }),
      })

      const { result } = renderHook(() => useRunOptimizer(), {
        wrapper: createWrapper(),
      })

      await expect(result.current.mutateAsync()).rejects.toThrow(
        'Optimizer service unavailable'
      )
    })
  })
})
