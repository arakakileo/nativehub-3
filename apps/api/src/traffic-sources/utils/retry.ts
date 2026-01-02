import { logger } from '../../lib/logger.js'
import { ApiError } from './api-error.js'

export interface RetryOptions {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  retryOn?: (error: Error) => boolean
}

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    retryOn = defaultRetryCondition,
  } = options

  let lastError: Error = new Error('Unknown error')
  let delay = initialDelay

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      if (attempt === maxRetries || !retryOn(lastError)) {
        throw lastError
      }

      logger.warn(
        { attempt: attempt + 1, maxRetries, delay, error: lastError.message },
        'Retrying request'
      )

      await sleep(delay)
      delay = Math.min(delay * 2, maxDelay)
    }
  }

  throw lastError
}

/**
 * Default retry condition - retry on rate limits and server errors
 */
function defaultRetryCondition(error: Error): boolean {
  if (error instanceof ApiError) {
    return error.isRateLimit() || error.isServerError()
  }

  // Retry on network errors
  if (error.message.includes('fetch') || error.message.includes('network')) {
    return true
  }

  return false
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
