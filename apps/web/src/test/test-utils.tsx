/**
 * Test utilities and wrapper components
 * Provides consistent testing setup across all frontend tests
 */

import React from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

// Create isolated QueryClient for each test
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        staleTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  })

interface WrapperProps {
  children: React.ReactNode
}

// Provider wrapper for tests requiring QueryClient
export const QueryWrapper = ({ children }: WrapperProps) => {
  const queryClient = createTestQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

// Provider wrapper for tests requiring Router
export const RouterWrapper = ({ children }: WrapperProps) => {
  return <BrowserRouter>{children}</BrowserRouter>
}

// Full provider wrapper (QueryClient + Router)
export const AllProviders = ({ children }: WrapperProps) => {
  const queryClient = createTestQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  )
}

// Custom render with all providers
const customRender = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllProviders, ...options })

// Re-export testing library utilities
export * from '@testing-library/react'
export { customRender as render }

// Mock API response helpers
export function createMockApiResponse<T>(data: T, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  } as Response)
}

export function createMockApiError(message: string, status = 500): Promise<Response> {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ error: message }),
  } as Response)
}

// Wait for async operations helper
export const waitForAsync = () => new Promise((resolve) => setTimeout(resolve, 0))

// Test data fixtures
export const TEST_USER = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  name: 'Test User',
}

export const TEST_SOURCE_ACCOUNT = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  sourceId: 'revcontent',
  name: 'Test Revcontent Account',
  status: 'connected',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

export const TEST_CAMPAIGN = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  externalCampaignId: 'ext-123',
  name: 'Test Campaign',
  status: 'active',
  enabled: true,
  budget: 100,
  bid: 0.5,
  spend: 25,
  impressions: 10000,
  clicks: 150,
  conversions: 5,
  ctr: 1.5,
  cpa: 5,
}
