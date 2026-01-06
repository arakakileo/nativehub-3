/**
 * Daily Report Service
 *
 * Generates and sends daily summary reports via WhatsApp.
 * Aggregates spend, conversions, and optimizer actions per user.
 */

import { db } from '../../lib/db.js'
import { users } from '../../db/auth-schema.js'
import { sourceAccounts, campaignSyncs, optimizerActions, optimizerCampaigns } from '../../db/schema.js'
import { notificationService } from '../notification/index.js'
import { logger } from '../../lib/logger.js'
import { eq, and, gte, lt, sql, inArray } from 'drizzle-orm'

interface UserDailyStats {
  userId: string
  phone: string
  totalSpend: number
  totalConversions: number
  actionsExecuted: number
  campaignsSynced: number
}

/**
 * Daily Report Service - Aggregates and sends daily summaries
 */
export class DailyReportService {
  /**
   * Generate and send daily reports for all users with notifications enabled
   */
  async generateAndSendReports(date?: Date): Promise<{
    processed: number
    sent: number
    skipped: number
    errors: number
  }> {
    const reportDate = date || this.getYesterdayDate()
    const dateStr = reportDate.toISOString().split('T')[0]
    const startOfDay = new Date(dateStr + 'T00:00:00Z')
    const endOfDay = new Date(dateStr + 'T23:59:59.999Z')

    logger.info({ date: dateStr }, 'Generating daily reports')

    // Get users with notifications enabled and phone configured
    const usersWithPhone = await db
      .select({
        id: users.id,
        phone: users.phone,
        notificationsEnabled: users.notificationsEnabled,
      })
      .from(users)
      .where(and(
        sql`${users.phone} IS NOT NULL`,
        eq(users.notificationsEnabled, true)
      ))

    let processed = 0
    let sent = 0
    let skipped = 0
    let errors = 0

    for (const user of usersWithPhone) {
      processed++

      if (!user.phone) {
        skipped++
        continue
      }

      try {
        // Aggregate stats for this user
        const stats = await this.aggregateUserStats(user.id, startOfDay, endOfDay)

        // Skip if no activity
        if (stats.totalSpend === 0 && stats.actionsExecuted === 0 && stats.campaignsSynced === 0) {
          logger.debug({ userId: user.id }, 'No activity for user, skipping report')
          skipped++
          continue
        }

        // Send report via WhatsApp
        await notificationService.sendDailyReport({
          userId: user.id,
          phone: user.phone,
          date: dateStr,
          totalSpend: stats.totalSpend,
          totalConversions: stats.totalConversions,
          actionsExecuted: stats.actionsExecuted,
          campaignsSynced: stats.campaignsSynced,
        })

        sent++
        logger.info({ userId: user.id, date: dateStr }, 'Daily report sent')
      } catch (error) {
        errors++
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        logger.error({ userId: user.id, error: errorMsg }, 'Failed to send daily report')
      }
    }

    logger.info({ processed, sent, skipped, errors, date: dateStr }, 'Daily report generation completed')

    return { processed, sent, skipped, errors }
  }

  /**
   * Aggregate stats for a single user for a given date range
   */
  async aggregateUserStats(userId: string, startOfDay: Date, endOfDay: Date): Promise<UserDailyStats> {
    // Get source accounts for this user
    const userAccounts = await db
      .select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    if (userAccounts.length === 0) {
      return {
        userId,
        phone: '',
        totalSpend: 0,
        totalConversions: 0,
        actionsExecuted: 0,
        campaignsSynced: 0,
      }
    }

    const accountIds = userAccounts.map(a => a.id)

    // Aggregate campaign syncs for today
    const syncStats = await db
      .select({
        totalSpend: sql<number>`COALESCE(SUM(${campaignSyncs.spend}), 0)`,
        totalConversions: sql<number>`COALESCE(SUM(${campaignSyncs.conversions}), 0)`,
        campaignCount: sql<number>`COUNT(DISTINCT ${campaignSyncs.externalCampaignId})`,
      })
      .from(campaignSyncs)
      .where(and(
        sql`${campaignSyncs.sourceAccountId} IN ${accountIds}`,
        gte(campaignSyncs.syncedAt, startOfDay),
        lt(campaignSyncs.syncedAt, endOfDay)
      ))

    // Get optimizer campaigns for these accounts
    const userCampaigns = await db
      .select({ id: optimizerCampaigns.id })
      .from(optimizerCampaigns)
      .where(inArray(optimizerCampaigns.sourceAccountId, accountIds))

    const campaignIds = userCampaigns.map(c => c.id)

    // Count optimizer actions for today (via campaigns)
    const actionStats = campaignIds.length > 0 ? await db
      .select({
        actionCount: sql<number>`COUNT(*)`,
      })
      .from(optimizerActions)
      .where(and(
        inArray(optimizerActions.optimizerCampaignId, campaignIds),
        gte(optimizerActions.executedAt, startOfDay),
        lt(optimizerActions.executedAt, endOfDay)
      )) : [{ actionCount: 0 }]

    const sync = syncStats[0] || { totalSpend: 0, totalConversions: 0, campaignCount: 0 }
    const action = actionStats[0] || { actionCount: 0 }

    return {
      userId,
      phone: '',
      totalSpend: Number(sync.totalSpend) || 0,
      totalConversions: Number(sync.totalConversions) || 0,
      actionsExecuted: Number(action.actionCount) || 0,
      campaignsSynced: Number(sync.campaignCount) || 0,
    }
  }

  /**
   * Get yesterday's date at midnight UTC
   */
  private getYesterdayDate(): Date {
    const yesterday = new Date()
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    yesterday.setUTCHours(0, 0, 0, 0)
    return yesterday
  }

  /**
   * Get report stats for a specific user (for API endpoint)
   */
  async getUserReportStats(userId: string, days: number = 7): Promise<Array<{
    date: string
    totalSpend: number
    totalConversions: number
    actionsExecuted: number
    campaignsSynced: number
  }>> {
    const results: Array<{
      date: string
      totalSpend: number
      totalConversions: number
      actionsExecuted: number
      campaignsSynced: number
    }> = []

    for (let i = 0; i < days; i++) {
      const date = new Date()
      date.setUTCDate(date.getUTCDate() - i - 1)
      const dateStr = date.toISOString().split('T')[0]
      const startOfDay = new Date(dateStr + 'T00:00:00Z')
      const endOfDay = new Date(dateStr + 'T23:59:59.999Z')

      const stats = await this.aggregateUserStats(userId, startOfDay, endOfDay)
      results.push({
        date: dateStr,
        totalSpend: stats.totalSpend,
        totalConversions: stats.totalConversions,
        actionsExecuted: stats.actionsExecuted,
        campaignsSynced: stats.campaignsSynced,
      })
    }

    return results
  }
}

// Singleton instance
export const dailyReportService = new DailyReportService()
