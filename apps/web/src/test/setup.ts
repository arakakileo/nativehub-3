import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'

// Mock matchMedia for components using responsive queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock scrollTo
window.scrollTo = vi.fn()

// Store reset functions for Zustand stores
export const storeResetFns = new Set<() => void>()

// Reset Zustand stores between tests
afterEach(() => {
  storeResetFns.forEach((resetFn) => resetFn())
})

// Cleanup React Testing Library after each test
afterEach(() => {
  cleanup()
})

// Clear mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
})

// Create test QueryClient with disabled retries
export const createTestQueryClient = () =>
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

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

export { mockFetch }
