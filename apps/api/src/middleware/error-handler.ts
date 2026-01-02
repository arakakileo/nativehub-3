import type { Context } from 'hono'
import { logger } from '../lib/logger.js'

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function errorHandler(err: Error, c: Context) {
  logger.error({ err, path: c.req.path, method: c.req.method }, 'Request error')

  if (err instanceof AppError) {
    return c.json({
      error: err.message,
      code: err.code
    }, err.statusCode as 400 | 401 | 403 | 404 | 500)
  }

  // Hide internal errors in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message

  return c.json({ error: message }, 500)
}
