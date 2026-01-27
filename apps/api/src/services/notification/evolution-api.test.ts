/**
 * Evolution API Client Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EvolutionAPI } from './evolution-api.js'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('EvolutionAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const api = new EvolutionAPI()
      expect(api.isConfigured()).toBe(false) // No API key in test env
    })

    it('should use provided config', () => {
      const api = new EvolutionAPI({
        baseUrl: 'https://test.api.com',
        apiKey: 'test-key',
        instanceName: 'test-instance',
      })
      expect(api.isConfigured()).toBe(true)
    })
  })

  describe('sendText', () => {
    it('should skip sending when API key is not configured', async () => {
      const api = new EvolutionAPI({ apiKey: '' })

      const result = await api.sendText({
        phone: '5511999999999',
        message: 'Test message',
      })

      expect(result.key.id).toBe('skipped')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should send message when API is configured', async () => {
      const api = new EvolutionAPI({
        baseUrl: 'https://test.api.com',
        apiKey: 'test-key',
        instanceName: 'test-instance',
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          key: { id: 'msg-123' },
          message: { conversation: 'Test message' },
        }),
      })

      const result = await api.sendText({
        phone: '5511999999999',
        message: 'Test message',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.api.com/message/sendText/test-instance',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'test-key',
          },
          body: JSON.stringify({
            number: '5511999999999',
            text: 'Test message',
          }),
        }
      )
      expect(result.key.id).toBe('msg-123')
    })

    it('should throw error on API failure', async () => {
      const api = new EvolutionAPI({
        baseUrl: 'https://test.api.com',
        apiKey: 'test-key',
        instanceName: 'test-instance',
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })

      await expect(
        api.sendText({
          phone: '5511999999999',
          message: 'Test message',
        })
      ).rejects.toThrow('Evolution API error: 401 - Unauthorized')
    })

    it('should handle network errors', async () => {
      const api = new EvolutionAPI({
        baseUrl: 'https://test.api.com',
        apiKey: 'test-key',
        instanceName: 'test-instance',
      })

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(
        api.sendText({
          phone: '5511999999999',
          message: 'Test message',
        })
      ).rejects.toThrow('Network error')
    })
  })

  describe('checkInstanceStatus', () => {
    it('should return not_configured when API key is missing', async () => {
      const api = new EvolutionAPI({ apiKey: '' })

      const result = await api.checkInstanceStatus()

      expect(result.state).toBe('not_configured')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should return connection state when API is configured', async () => {
      const api = new EvolutionAPI({
        baseUrl: 'https://test.api.com',
        apiKey: 'test-key',
        instanceName: 'test-instance',
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          state: 'open',
          instance: 'test-instance',
        }),
      })

      const result = await api.checkInstanceStatus()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.api.com/instance/connectionState/test-instance',
        {
          headers: { 'apikey': 'test-key' },
        }
      )
      expect(result.state).toBe('open')
    })

    it('should return error state on API failure', async () => {
      const api = new EvolutionAPI({
        baseUrl: 'https://test.api.com',
        apiKey: 'test-key',
        instanceName: 'test-instance',
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Server error',
      })

      const result = await api.checkInstanceStatus()

      expect(result.state).toBe('error')
    })

    it('should handle connection errors', async () => {
      const api = new EvolutionAPI({
        baseUrl: 'https://test.api.com',
        apiKey: 'test-key',
        instanceName: 'test-instance',
      })

      mockFetch.mockRejectedValueOnce(new Error('Connection failed'))

      const result = await api.checkInstanceStatus()

      expect(result.state).toBe('connection_error')
    })
  })

  describe('isConfigured', () => {
    it('should return false when API key is empty', () => {
      const api = new EvolutionAPI({ apiKey: '' })
      expect(api.isConfigured()).toBe(false)
    })

    it('should return true when all config is provided', () => {
      const api = new EvolutionAPI({
        baseUrl: 'https://test.api.com',
        apiKey: 'test-key',
        instanceName: 'test-instance',
      })
      expect(api.isConfigured()).toBe(true)
    })
  })
})
