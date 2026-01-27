/**
 * Anomaly Detection Service
 *
 * Detects unusual patterns in campaign performance:
 * - Spend spikes (sudden increase in spending)
 * - Conversion drops (significant decrease in conversion rate)
 * - CTR anomalies (unusual click-through rate changes)
 * - CPA anomalies (sudden CPA changes)
 *
 * Uses simple statistical methods (z-score, moving averages)
 */

import { db } from '../../lib/db.js'
import { campaignSyncs, alerts } from '../../db/schema.js'
import { notificationService } from '../notification/index.js'
import { users } from '../../db/auth-schema.js'
import { logger } from '../../lib/logger.js'
import { eq, and, gte, desc, sql } from 'drizzle-orm'

export type AnomalyType = 'spend_spike' | 'conversion_drop' | 'ctr_anomaly' | 'cpa_spike'
export type AnomalySeverity = 'info' | 'warning' | 'critical'

export interface Anomaly {
  type: AnomalyType
  severity: AnomalySeverity
  campaignId: string
  campaignName: string
  metric: string
  currentValue: number
  expectedValue: number
  deviation: number // Standard deviations from mean
  message: string
}

interface MetricStats {
  mean: number
  stdDev: number
  dataPoints: number
}

/**
 * Anomaly Detection Service
 */
export class AnomalyDetectionService {
  private readonly Z_SCORE_WARNING = 2.0 // 2 std deviations = warning
  private readonly Z_SCORE_CRITICAL = 3.0 // 3 std deviations = critical
  private readonly MIN_DATA_POINTS = 5 // Minimum history for detection
  private readonly LOOKBACK_DAYS = 14 // Days of history to analyze

  /**
   * Detect anomalies for a source account's campaigns
   */
  async detectAnomalies(sourceAccountId: string): Promise<Anomaly[]> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - this.LOOKBACK_DAYS)

    try {
      // Get recent campaign performance
      const syncs = await db
        .select()
        .from(campaignSyncs)
        .where(and(
          eq(campaignSyncs.sourceAccountId, sourceAccountId),
          gte(campaignSyncs.syncedAt, startDate)
        ))
        .orderBy(desc(campaignSyncs.syncedAt))

      if (syncs.length < this.MIN_DATA_POINTS) {
        logger.debug({ sourceAccountId }, 'Insufficient data for anomaly detection')
        return []
      }

      // Group by campaign
      const campaignGroups = new Map<string, typeof syncs>()
      for (const sync of syncs) {
        const key = sync.externalCampaignId
        if (!campaignGroups.has(key)) {
          campaignGroups.set(key, [])
        }
        campaignGroups.get(key)!.push(sync)
      }

      const anomalies: Anomaly[] = []

      for (const [campaignId, campaignSyncs] of campaignGroups) {
        if (campaignSyncs.length < this.MIN_DATA_POINTS) {
          continue
        }

        const campaignAnomalies = this.analyzeCampaign(campaignId, campaignSyncs)
        anomalies.push(...campaignAnomalies)
      }

      logger.info({
        sourceAccountId,
        anomaliesFound: anomalies.length,
        campaignsAnalyzed: campaignGroups.size,
      }, 'Anomaly detection complete')

      return anomalies
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg, sourceAccountId }, 'Failed to detect anomalies')
      throw error
    }
  }

  /**
   * Analyze a single campaign for anomalies
   */
  private analyzeCampaign(
    campaignId: string,
    syncs: Array<{
      externalCampaignId: string
      campaignName: string
      spend: string
      conversions: number
      impressions: number
      clicks: number
    }>
  ): Anomaly[] {
    const anomalies: Anomaly[] = []
    const campaignName = syncs[0]?.campaignName || campaignId

    // Get latest sync (most recent)
    const latest = syncs[0]
    // Get historical (excluding latest)
    const historical = syncs.slice(1)

    if (historical.length < this.MIN_DATA_POINTS - 1) {
      return anomalies
    }

    // Check spend anomaly
    const spendAnomaly = this.checkSpendAnomaly(latest, historical, campaignId, campaignName)
    if (spendAnomaly) anomalies.push(spendAnomaly)

    // Check CPA anomaly
    const cpaAnomaly = this.checkCpaAnomaly(latest, historical, campaignId, campaignName)
    if (cpaAnomaly) anomalies.push(cpaAnomaly)

    // Check CTR anomaly
    const ctrAnomaly = this.checkCtrAnomaly(latest, historical, campaignId, campaignName)
    if (ctrAnomaly) anomalies.push(ctrAnomaly)

    // Check conversion drop
    const convAnomaly = this.checkConversionDrop(latest, historical, campaignId, campaignName)
    if (convAnomaly) anomalies.push(convAnomaly)

    return anomalies
  }

  /**
   * Check for spend spikes
   */
  private checkSpendAnomaly(
    latest: { spend: string },
    historical: Array<{ spend: string }>,
    campaignId: string,
    campaignName: string
  ): Anomaly | null {
    const currentSpend = Number(latest.spend || 0)
    const historicalSpends = historical.map(s => Number(s.spend || 0)).filter(s => s > 0)

    if (historicalSpends.length < 3) return null

    const stats = this.calculateStats(historicalSpends)
    if (stats.stdDev === 0) return null

    const zScore = (currentSpend - stats.mean) / stats.stdDev

    if (zScore > this.Z_SCORE_WARNING) {
      return {
        type: 'spend_spike',
        severity: zScore > this.Z_SCORE_CRITICAL ? 'critical' : 'warning',
        campaignId,
        campaignName,
        metric: 'spend',
        currentValue: currentSpend,
        expectedValue: stats.mean,
        deviation: zScore,
        message: `Spend spike: $${currentSpend.toFixed(2)} vs avg $${stats.mean.toFixed(2)} (${zScore.toFixed(1)}σ)`,
      }
    }

    return null
  }

  /**
   * Check for CPA spikes
   */
  private checkCpaAnomaly(
    latest: { spend: string; conversions: number },
    historical: Array<{ spend: string; conversions: number }>,
    campaignId: string,
    campaignName: string
  ): Anomaly | null {
    const currentSpend = Number(latest.spend || 0)
    const currentConv = latest.conversions || 0
    if (currentConv === 0) return null

    const currentCpa = currentSpend / currentConv

    const historicalCpas = historical
      .filter(s => (s.conversions || 0) > 0)
      .map(s => Number(s.spend || 0) / (s.conversions || 1))

    if (historicalCpas.length < 3) return null

    const stats = this.calculateStats(historicalCpas)
    if (stats.stdDev === 0) return null

    const zScore = (currentCpa - stats.mean) / stats.stdDev

    if (zScore > this.Z_SCORE_WARNING) {
      return {
        type: 'cpa_spike',
        severity: zScore > this.Z_SCORE_CRITICAL ? 'critical' : 'warning',
        campaignId,
        campaignName,
        metric: 'cpa',
        currentValue: currentCpa,
        expectedValue: stats.mean,
        deviation: zScore,
        message: `CPA spike: $${currentCpa.toFixed(2)} vs avg $${stats.mean.toFixed(2)} (${zScore.toFixed(1)}σ)`,
      }
    }

    return null
  }

  /**
   * Check for CTR anomalies (both spikes and drops)
   */
  private checkCtrAnomaly(
    latest: { impressions: number; clicks: number },
    historical: Array<{ impressions: number; clicks: number }>,
    campaignId: string,
    campaignName: string
  ): Anomaly | null {
    const currentImpr = latest.impressions || 0
    const currentClicks = latest.clicks || 0
    if (currentImpr === 0) return null

    const currentCtr = (currentClicks / currentImpr) * 100

    const historicalCtrs = historical
      .filter(s => (s.impressions || 0) > 0)
      .map(s => ((s.clicks || 0) / (s.impressions || 1)) * 100)

    if (historicalCtrs.length < 3) return null

    const stats = this.calculateStats(historicalCtrs)
    if (stats.stdDev === 0) return null

    const zScore = Math.abs(currentCtr - stats.mean) / stats.stdDev

    if (zScore > this.Z_SCORE_WARNING) {
      const direction = currentCtr > stats.mean ? 'spike' : 'drop'
      return {
        type: 'ctr_anomaly',
        severity: zScore > this.Z_SCORE_CRITICAL ? 'warning' : 'info',
        campaignId,
        campaignName,
        metric: 'ctr',
        currentValue: currentCtr,
        expectedValue: stats.mean,
        deviation: zScore,
        message: `CTR ${direction}: ${currentCtr.toFixed(2)}% vs avg ${stats.mean.toFixed(2)}% (${zScore.toFixed(1)}σ)`,
      }
    }

    return null
  }

  /**
   * Check for significant conversion drops
   */
  private checkConversionDrop(
    latest: { conversions: number },
    historical: Array<{ conversions: number }>,
    campaignId: string,
    campaignName: string
  ): Anomaly | null {
    const currentConv = latest.conversions || 0
    const historicalConvs = historical.map(s => s.conversions || 0)

    if (historicalConvs.length < 3) return null

    const stats = this.calculateStats(historicalConvs)
    if (stats.stdDev === 0 || stats.mean < 1) return null

    const zScore = (stats.mean - currentConv) / stats.stdDev

    if (zScore > this.Z_SCORE_WARNING && currentConv < stats.mean * 0.5) {
      return {
        type: 'conversion_drop',
        severity: zScore > this.Z_SCORE_CRITICAL ? 'critical' : 'warning',
        campaignId,
        campaignName,
        metric: 'conversions',
        currentValue: currentConv,
        expectedValue: stats.mean,
        deviation: zScore,
        message: `Conversion drop: ${currentConv} vs avg ${stats.mean.toFixed(1)} (${((1 - currentConv / stats.mean) * 100).toFixed(0)}% decrease)`,
      }
    }

    return null
  }

  /**
   * Calculate mean and standard deviation
   */
  private calculateStats(values: number[]): MetricStats {
    if (values.length === 0) {
      return { mean: 0, stdDev: 0, dataPoints: 0 }
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2))
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length
    const stdDev = Math.sqrt(avgSquaredDiff)

    return { mean, stdDev, dataPoints: values.length }
  }

  /**
   * Send alerts for detected anomalies
   */
  async sendAnomalyAlerts(params: {
    userId: string
    sourceAccountId: string
    anomalies: Anomaly[]
  }): Promise<void> {
    const { userId, sourceAccountId, anomalies } = params

    // Get user phone
    const [user] = await db
      .select({ phone: users.phone, notificationsEnabled: users.notificationsEnabled })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user?.phone || !user.notificationsEnabled) {
      logger.debug({ userId }, 'User has no phone or notifications disabled')
      return
    }

    // Group critical anomalies
    const critical = anomalies.filter(a => a.severity === 'critical')
    const warnings = anomalies.filter(a => a.severity === 'warning')

    // Send critical alerts immediately
    for (const anomaly of critical.slice(0, 3)) { // Limit to 3
      await notificationService.send({
        userId,
        phone: user.phone,
        alertType: 'critical_spend',
        severity: 'critical',
        title: `Anomaly: ${anomaly.campaignName}`,
        message: anomaly.message,
        sourceAccountId,
        data: {
          type: anomaly.type,
          current: anomaly.currentValue.toFixed(2),
          expected: anomaly.expectedValue.toFixed(2),
          deviation: `${anomaly.deviation.toFixed(1)}σ`,
        },
      })
    }

    // Log warnings (don't spam WhatsApp)
    if (warnings.length > 0) {
      logger.info({
        userId,
        warningCount: warnings.length,
        campaigns: warnings.map(w => w.campaignName),
      }, 'Anomaly warnings detected')
    }
  }
}

// Singleton instance
export const anomalyDetectionService = new AnomalyDetectionService()
