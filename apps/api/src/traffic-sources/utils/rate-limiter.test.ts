import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter, getRateLimiter } from './rate-limiter.js'

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('acquire', () => {
    it('should allow requests within limit', async () => {
      const limiter = new RateLimiter({ requests: 3, perSeconds: 1 })

      // Should not block for first 3 requests
      await limiter.acquire()
      await limiter.acquire()
      await limiter.acquire()

      expect(limiter.getCurrentCount()).toBe(3)
    })

    it('should wait when limit is reached', async () => {
      const limiter = new RateLimiter({ requests: 2, perSeconds: 1 })

      await limiter.acquire()
      await limiter.acquire()

      // Third request should wait
      const startTime = Date.now()
      const acquirePromise = limiter.acquire()

      // Advance time past the window
      await vi.advanceTimersByTimeAsync(1100)
      await acquirePromise

      // Should have waited approximately 1 second
      expect(limiter.getCurrentCount()).toBe(1)
    })

    it('should clean up old requests from window', async () => {
      const limiter = new RateLimiter({ requests: 2, perSeconds: 1 })

      await limiter.acquire()
      expect(limiter.getCurrentCount()).toBe(1)

      // Advance past the window
      await vi.advanceTimersByTimeAsync(1100)

      expect(limiter.getCurrentCount()).toBe(0)
    })
  })

  describe('getCurrentCount', () => {
    it('should return current requests in window', async () => {
      const limiter = new RateLimiter({ requests: 5, perSeconds: 10 })

      expect(limiter.getCurrentCount()).toBe(0)

      await limiter.acquire()
      expect(limiter.getCurrentCount()).toBe(1)

      await limiter.acquire()
      await limiter.acquire()
      expect(limiter.getCurrentCount()).toBe(3)
    })

    it('should exclude expired requests', async () => {
      const limiter = new RateLimiter({ requests: 5, perSeconds: 1 })

      await limiter.acquire()
      await limiter.acquire()
      expect(limiter.getCurrentCount()).toBe(2)

      // Advance past the window
      await vi.advanceTimersByTimeAsync(1100)

      expect(limiter.getCurrentCount()).toBe(0)
    })
  })

  describe('reset', () => {
    it('should clear all requests', async () => {
      const limiter = new RateLimiter({ requests: 5, perSeconds: 10 })

      await limiter.acquire()
      await limiter.acquire()
      await limiter.acquire()
      expect(limiter.getCurrentCount()).toBe(3)

      limiter.reset()
      expect(limiter.getCurrentCount()).toBe(0)
    })
  })
})

describe('getRateLimiter', () => {
  it('should return same limiter for same config', () => {
    const limiter1 = getRateLimiter('source1', { requests: 10, perSeconds: 1 })
    const limiter2 = getRateLimiter('source1', { requests: 10, perSeconds: 1 })

    expect(limiter1).toBe(limiter2)
  })

  it('should return different limiter for different source', () => {
    const limiter1 = getRateLimiter('source1', { requests: 10, perSeconds: 1 })
    const limiter2 = getRateLimiter('source2', { requests: 10, perSeconds: 1 })

    expect(limiter1).not.toBe(limiter2)
  })

  it('should return different limiter for different config', () => {
    const limiter1 = getRateLimiter('source1', { requests: 10, perSeconds: 1 })
    const limiter2 = getRateLimiter('source1', { requests: 20, perSeconds: 1 })

    expect(limiter1).not.toBe(limiter2)
  })
})
