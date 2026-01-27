/**
 * Smoke test to verify test infrastructure works
 * This test validates the testing setup is properly configured
 */

import { describe, it, expect } from 'vitest'
import { createTestQueryClient } from './setup'

describe('Test Infrastructure', () => {
  it('should have global test environment configured', () => {
    expect(typeof window).toBe('object')
    expect(typeof document).toBe('object')
  })

  it('should have matchMedia mocked', () => {
    const mq = window.matchMedia('(min-width: 768px)')
    expect(mq.matches).toBe(false)
    expect(typeof mq.addEventListener).toBe('function')
  })

  it('should have ResizeObserver mocked', () => {
    const observer = new ResizeObserver(() => {})
    expect(typeof observer.observe).toBe('function')
    expect(typeof observer.disconnect).toBe('function')
  })

  it('should create test QueryClient with disabled retries', () => {
    const client = createTestQueryClient()
    const defaultOptions = client.getDefaultOptions()

    expect(defaultOptions.queries?.retry).toBe(false)
    expect(defaultOptions.mutations?.retry).toBe(false)
  })

  it('should have fetch mocked', () => {
    expect(typeof fetch).toBe('function')
  })
})
