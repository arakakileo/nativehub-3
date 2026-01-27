import { logger } from '../../lib/logger.js'

interface RateLimitConfig {
  requests: number
  perSeconds: number
}

/**
 * Simple in-memory rate limiter using sliding window
 */
export class RateLimiter {
  private requests: number[] = []
  private readonly config: RateLimitConfig

  constructor(config: RateLimitConfig) {
    this.config = config
  }

  /**
   * Wait until a request can be made within rate limits
   */
  async acquire(): Promise<void> {
    const now = Date.now()
    const windowStart = now - this.config.perSeconds * 1000

    // Remove old requests outside the window
    this.requests = this.requests.filter((time) => time > windowStart)

    if (this.requests.length >= this.config.requests) {
      // Calculate wait time until oldest request expires
      const oldestRequest = this.requests[0]
      const waitTime = oldestRequest - windowStart + 100 // Add small buffer

      logger.debug(
        { waitTime, currentRequests: this.requests.length },
        'Rate limit reached, waiting'
      )

      await new Promise((resolve) => setTimeout(resolve, waitTime))
      return this.acquire() // Retry after waiting
    }

    this.requests.push(now)
  }

  /**
   * Get current request count in window
   */
  getCurrentCount(): number {
    const windowStart = Date.now() - this.config.perSeconds * 1000
    return this.requests.filter((time) => time > windowStart).length
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requests = []
  }
}

// Rate limiters for each traffic source
const rateLimiters = new Map<string, RateLimiter>()

/**
 * Get or create a rate limiter for a traffic source
 */
export function getRateLimiter(sourceId: string, config: RateLimitConfig): RateLimiter {
  const key = `${sourceId}-${config.requests}-${config.perSeconds}`

  if (!rateLimiters.has(key)) {
    rateLimiters.set(key, new RateLimiter(config))
  }

  return rateLimiters.get(key)!
}
