import { createMiddleware } from "hono/factory"
import { rateLimitConfig } from "../lib/config.js"

// Simple in-memory rate limiter
// For production, consider using Redis-based rate limiting
interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // Clean every minute

function getRateLimitKey(ip: string, prefix: string): string {
  return `${prefix}:${ip}`
}

function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || entry.resetTime < now) {
    // First request in window or window expired
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    })
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs,
    }
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    }
  }

  entry.count++
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetTime: entry.resetTime,
  }
}

/**
 * Rate limiting middleware for auth endpoints
 * Stricter limits to prevent brute force attacks
 */
export const authRateLimiter = createMiddleware(async (c, next) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"

  const key = getRateLimitKey(ip, "auth")
  const { allowed, remaining, resetTime } = checkRateLimit(
    key,
    rateLimitConfig.auth.windowMs,
    rateLimitConfig.auth.max
  )

  // Set rate limit headers
  c.header("X-RateLimit-Limit", String(rateLimitConfig.auth.max))
  c.header("X-RateLimit-Remaining", String(remaining))
  c.header("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)))

  if (!allowed) {
    return c.json(
      {
        error: "Too many requests",
        message: "Please try again later",
        retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
      },
      429
    )
  }

  await next()
})

/**
 * Rate limiting middleware for general API endpoints
 * More permissive limits for regular API usage
 */
export const apiRateLimiter = createMiddleware(async (c, next) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"

  const key = getRateLimitKey(ip, "api")
  const { allowed, remaining, resetTime } = checkRateLimit(
    key,
    rateLimitConfig.api.windowMs,
    rateLimitConfig.api.max
  )

  // Set rate limit headers
  c.header("X-RateLimit-Limit", String(rateLimitConfig.api.max))
  c.header("X-RateLimit-Remaining", String(remaining))
  c.header("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)))

  if (!allowed) {
    return c.json(
      {
        error: "Too many requests",
        message: "Rate limit exceeded",
        retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
      },
      429
    )
  }

  await next()
})
