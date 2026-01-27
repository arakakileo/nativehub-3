import type { Context, Next } from 'hono'
import type { ZodSchema, ZodError } from 'zod'

// Extend Hono context with validated body
declare module 'hono' {
  interface ContextVariableMap {
    validatedBody: unknown
    validatedQuery: unknown
  }
}

/**
 * Validation middleware for request body
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json()
      const result = schema.safeParse(body)

      if (!result.success) {
        return c.json({
          error: 'Validation failed',
          details: formatZodError(result.error)
        }, 400)
      }

      c.set('validatedBody', result.data)
      await next()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
  }
}

/**
 * Validation middleware for query params
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    const query = c.req.query()
    const result = schema.safeParse(query)

    if (!result.success) {
      return c.json({
        error: 'Invalid query parameters',
        details: formatZodError(result.error)
      }, 400)
    }

    c.set('validatedQuery', result.data)
    await next()
  }
}

/**
 * Format Zod error for API response
 */
function formatZodError(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {}

  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root'
    if (!formatted[path]) {
      formatted[path] = []
    }
    formatted[path].push(issue.message)
  }

  return formatted
}
