/**
 * Notification Service
 *
 * Sends real-time alerts via WhatsApp using Evolution API.
 * Features:
 * - Message formatting with severity indicators
 * - Rate limiting/throttling to prevent spam
 * - Alert logging to database
 * - Convenience methods for common alert types
 */

import { evolutionApi } from './evolution-api.js'
import { db } from '../../lib/db.js'
import { alerts } from '../../db/schema.js'
import { logger } from '../../lib/logger.js'

type AlertType = 'action_executed' | 'critical_spend' | 'daily_report' | 'optimizer_error'
type Severity = 'info' | 'warning' | 'critical'

interface NotificationParams {
  userId: string
  phone: string
  alertType: AlertType
  severity: Severity
  title: string
  message: string
  data?: Record<string, unknown>
  sourceAccountId?: string
  optimizerCampaignId?: string
}

/**
 * Notification Service - WhatsApp alerts for optimizer actions
 */
export class NotificationService {
  private readonly THROTTLE_MINUTES = 5
  private readonly MAX_ALERTS_PER_HOUR = 20
  private recentAlerts = new Map<string, { count: number; resetAt: number }>()

  /**
   * Send notification via WhatsApp and log to database
   */
  async send(params: NotificationParams): Promise<void> {
    // Check throttling
    if (this.isThrottled(params.phone)) {
      logger.warn({ phone: params.phone }, 'Alert throttled - max alerts per hour exceeded')
      return
    }

    try {
      // Format message with emoji and structure
      const formattedMessage = this.formatMessage(params)

      // Send via WhatsApp
      if (evolutionApi.isConfigured()) {
        await evolutionApi.sendText({
          phone: params.phone,
          message: formattedMessage,
        })
      } else {
        logger.info({ alertType: params.alertType, title: params.title }, 'Evolution API not configured, alert logged only')
      }

      // Log to database
      await this.logAlert(params)

      // Increment throttle counter
      this.incrementThrottle(params.phone)

      logger.info({ alertType: params.alertType, phone: params.phone }, 'Notification sent')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg, alertType: params.alertType }, 'Failed to send notification')
      // Don't throw - notification failure shouldn't break optimizer flow
    }
  }

  /**
   * Format message with emoji, title, and optional data block
   */
  private formatMessage(params: NotificationParams): string {
    const emoji = this.getSeverityEmoji(params.severity)

    const lines = [
      `${emoji} *NativeHub Alert*`,
      ``,
      `*${params.title}*`,
      params.message,
    ]

    if (params.data && Object.keys(params.data).length > 0) {
      lines.push('', '```')
      for (const [key, value] of Object.entries(params.data)) {
        lines.push(`${key}: ${value}`)
      }
      lines.push('```')
    }

    return lines.join('\n')
  }

  /**
   * Get emoji indicator for alert severity
   */
  private getSeverityEmoji(severity: Severity): string {
    switch (severity) {
      case 'critical':
        return '🚨'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ️'
    }
  }

  /**
   * Check if phone number is rate-limited
   */
  private isThrottled(phone: string): boolean {
    const entry = this.recentAlerts.get(phone)
    const now = Date.now()

    // Reset if hour has passed
    if (entry && entry.resetAt < now) {
      this.recentAlerts.delete(phone)
      return false
    }

    return entry ? entry.count >= this.MAX_ALERTS_PER_HOUR : false
  }

  /**
   * Increment throttle counter for phone number
   */
  private incrementThrottle(phone: string): void {
    const now = Date.now()
    const entry = this.recentAlerts.get(phone)

    if (entry && entry.resetAt > now) {
      entry.count++
    } else {
      this.recentAlerts.set(phone, {
        count: 1,
        resetAt: now + 60 * 60 * 1000, // 1 hour from now
      })
    }
  }

  /**
   * Log alert to database for history and audit
   */
  private async logAlert(params: NotificationParams): Promise<void> {
    await db.insert(alerts).values({
      userId: params.userId,
      sourceAccountId: params.sourceAccountId,
      optimizerCampaignId: params.optimizerCampaignId,
      alertType: params.alertType,
      severity: params.severity,
      title: params.title,
      message: params.message,
      data: params.data,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Convenience Methods
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Notify about an optimizer action that was executed
   */
  async notifyActionExecuted(params: {
    userId: string
    phone: string
    campaignName: string
    actionType: string
    targetName: string
    reason: string
    sourceAccountId?: string
    optimizerCampaignId?: string
  }): Promise<void> {
    await this.send({
      userId: params.userId,
      phone: params.phone,
      alertType: 'action_executed',
      severity: 'info',
      title: `${params.actionType.toUpperCase()}: ${params.targetName}`,
      message: `Campaign: ${params.campaignName}\n${params.reason}`,
      sourceAccountId: params.sourceAccountId,
      optimizerCampaignId: params.optimizerCampaignId,
    })
  }

  /**
   * Notify about critical spend (bleeding campaign)
   */
  async notifyCriticalSpend(params: {
    userId: string
    phone: string
    campaignName: string
    spend: number
    targetCpa: number
    conversions: number
    sourceAccountId?: string
    optimizerCampaignId?: string
  }): Promise<void> {
    const ratio = (params.spend / params.targetCpa).toFixed(1)
    await this.send({
      userId: params.userId,
      phone: params.phone,
      alertType: 'critical_spend',
      severity: 'critical',
      title: `BLEEDING: ${params.campaignName}`,
      message: `Spent $${params.spend.toFixed(2)} (${ratio}x CPA goal) with only ${params.conversions} conversions!`,
      data: {
        spend: `$${params.spend.toFixed(2)}`,
        targetCpa: `$${params.targetCpa.toFixed(2)}`,
        conversions: params.conversions,
      },
      sourceAccountId: params.sourceAccountId,
      optimizerCampaignId: params.optimizerCampaignId,
    })
  }

  /**
   * Notify about optimizer error
   */
  async notifyOptimizerError(params: {
    userId: string
    phone: string
    campaignName: string
    error: string
    sourceAccountId?: string
    optimizerCampaignId?: string
  }): Promise<void> {
    await this.send({
      userId: params.userId,
      phone: params.phone,
      alertType: 'optimizer_error',
      severity: 'warning',
      title: `Optimizer Error: ${params.campaignName}`,
      message: params.error,
      sourceAccountId: params.sourceAccountId,
      optimizerCampaignId: params.optimizerCampaignId,
    })
  }

  /**
   * Send daily summary report
   */
  async sendDailyReport(params: {
    userId: string
    phone: string
    date: string
    totalSpend: number
    totalConversions: number
    actionsExecuted: number
    campaignsSynced: number
    sourceAccountId?: string
  }): Promise<void> {
    const avgCpa = params.totalConversions > 0 ? params.totalSpend / params.totalConversions : 0

    await this.send({
      userId: params.userId,
      phone: params.phone,
      alertType: 'daily_report',
      severity: 'info',
      title: `Daily Report: ${params.date}`,
      message: 'Optimizer summary for today',
      data: {
        'Total Spend': `$${params.totalSpend.toFixed(2)}`,
        'Conversions': params.totalConversions,
        'Avg CPA': `$${avgCpa.toFixed(2)}`,
        'Actions': params.actionsExecuted,
        'Campaigns': params.campaignsSynced,
      },
      sourceAccountId: params.sourceAccountId,
    })
  }
}

// Singleton instance
export const notificationService = new NotificationService()
