import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { AppError, errorHandler } from './error-handler.js'

describe('error-handler', () => {
  describe('AppError', () => {
    it('should create error with message and status code', () => {
      const error = new AppError('Not found', 404)

      expect(error.message).toBe('Not found')
      expect(error.statusCode).toBe(404)
      expect(error.name).toBe('AppError')
    })

    it('should default to 500 status code', () => {
      const error = new AppError('Server error')

      expect(error.statusCode).toBe(500)
    })

    it('should support error code', () => {
      const error = new AppError('Validation failed', 400, 'VALIDATION_ERROR')

      expect(error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('errorHandler', () => {
    let app: Hono

    beforeEach(() => {
      app = new Hono()
      app.onError(errorHandler)
    })

    it('should handle AppError with proper status code', async () => {
      app.get('/test', () => {
        throw new AppError('Resource not found', 404)
      })

      const res = await app.request('/test')

      expect(res.status).toBe(404)
      const json = await res.json()
      expect(json.error).toBe('Resource not found')
    })

    it('should handle AppError with code', async () => {
      app.get('/test', () => {
        throw new AppError('Invalid input', 400, 'INVALID_INPUT')
      })

      const res = await app.request('/test')

      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Invalid input')
      expect(json.code).toBe('INVALID_INPUT')
    })

    it('should handle generic Error as 500', async () => {
      app.get('/test', () => {
        throw new Error('Something went wrong')
      })

      const res = await app.request('/test')

      expect(res.status).toBe(500)
    })

    it('should hide error details in production', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      app.get('/test', () => {
        throw new Error('Sensitive internal error')
      })

      const res = await app.request('/test')
      const json = await res.json()

      expect(json.error).toBe('Internal server error')
      expect(json.error).not.toContain('Sensitive')

      process.env.NODE_ENV = originalEnv
    })

    it('should show error details in development', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      app.get('/test', () => {
        throw new Error('Debug error message')
      })

      const res = await app.request('/test')
      const json = await res.json()

      expect(json.error).toBe('Debug error message')

      process.env.NODE_ENV = originalEnv
    })
  })
})
