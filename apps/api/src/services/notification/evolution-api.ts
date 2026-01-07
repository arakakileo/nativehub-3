/**
 * Evolution API Client
 *
 * Wraps Evolution WhatsApp API for sending text messages.
 * Used by notification service for real-time alerts.
 *
 * Evolution API docs: https://doc.evolution-api.com/
 */

import { logger } from '../../lib/logger.js'

interface EvolutionConfig {
  baseUrl: string
  apiKey: string
  instanceName: string
}

interface SendMessageParams {
  phone: string // Format: 5511999999999 (country + DDD + number)
  message: string
}

interface SendMessageResponse {
  key: { id: string }
  message: { conversation: string }
}

interface ConnectionState {
  state: string // 'open', 'close', 'connecting'
  instance?: string
}

/**
 * Evolution API Client for WhatsApp messaging
 */
export class EvolutionAPI {
  private config: EvolutionConfig

  constructor(config?: Partial<EvolutionConfig>) {
    this.config = {
      baseUrl: config?.baseUrl || process.env.EVOLUTION_API_URL || 'https://evolution.arakakileo.com',
      apiKey: config?.apiKey || process.env.EVOLUTION_API_KEY || '',
      instanceName: config?.instanceName || process.env.EVOLUTION_INSTANCE || 'nativehub',
    }
  }

  /**
   * Send a text message via WhatsApp
   */
  async sendText(params: SendMessageParams): Promise<SendMessageResponse> {
    if (!this.config.apiKey) {
      logger.warn('Evolution API key not configured, skipping message')
      return { key: { id: 'skipped' }, message: { conversation: params.message } }
    }

    const url = `${this.config.baseUrl}/message/sendText/${this.config.instanceName}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.config.apiKey,
        },
        body: JSON.stringify({
          number: params.phone,
          text: params.message,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        logger.error({ error, phone: params.phone, status: response.status }, 'Evolution API error')
        throw new Error(`Evolution API error: ${response.status} - ${error}`)
      }

      const result = await response.json() as SendMessageResponse
      logger.debug({ messageId: result.key?.id, phone: params.phone }, 'Message sent via Evolution API')
      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg, phone: params.phone }, 'Failed to send WhatsApp message')
      throw error
    }
  }

  /**
   * Check WhatsApp instance connection status
   */
  async checkInstanceStatus(): Promise<ConnectionState> {
    if (!this.config.apiKey) {
      logger.warn('Evolution API key not configured')
      return { state: 'not_configured' }
    }

    const url = `${this.config.baseUrl}/instance/connectionState/${this.config.instanceName}`

    try {
      const response = await fetch(url, {
        headers: { 'apikey': this.config.apiKey },
      })

      if (!response.ok) {
        const error = await response.text()
        logger.error({ error }, 'Failed to check Evolution instance status')
        return { state: 'error' }
      }

      return await response.json() as ConnectionState
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg }, 'Failed to connect to Evolution API')
      return { state: 'connection_error' }
    }
  }

  /**
   * Check if Evolution API is configured and ready
   */
  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.baseUrl && this.config.instanceName)
  }
}

// Singleton instance
export const evolutionApi = new EvolutionAPI()
