/**
 * Anomaly Detection API Routes
 *
 * Endpoints for detecting unusual campaign performance patterns
 */

import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../lib/db.js'
import { sourceAccounts } from '../db/schema.js'
import { anomalyDetectionService } from '../services/optimizer/index.js'
import { logger } from '../lib/logger.js'

export const optimizerAnomaliesRoutes = new Hono()
  /**
   * Detect anomalies for a specific source account
   * GET /optimizer/anomalies/:sourceAccountId
   */
  .get('/:sourceAccountId', async (c) => {
    const userId = c.get('userId')
    const sourceAccountId = c.req.param('sourceAccountId')

    // Verify user owns the source account
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.id, sourceAccountId))

    if (accounts.length === 0) {
      return c.json({ error: 'Source account not found' }, 404)
    }

    // Verify ownership
    const userAccounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = userAccounts.map(a => a.id)
    if (!userAccountIds.includes(sourceAccountId)) {
      return c.json({ error: 'Source account not found' }, 404)
    }

    try {
      const anomalies = await anomalyDetectionService.detectAnomalies(sourceAccountId)

      // Group by severity
      const critical = anomalies.filter(a => a.severity === 'critical')
      const warning = anomalies.filter(a => a.severity === 'warning')
      const info = anomalies.filter(a => a.severity === 'info')

      return c.json({
        sourceAccountId,
        anomalies,
        summary: {
          total: anomalies.length,
          critical: critical.length,
          warning: warning.length,
          info: info.length,
        },
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg, sourceAccountId }, 'Failed to detect anomalies')
      return c.json({ error: 'Failed to detect anomalies' }, 500)
    }
  })

  /**
   * Detect anomalies for all user's source accounts
   * GET /optimizer/anomalies
   */
  .get('/', async (c) => {
    const userId = c.get('userId')

    // Get user's source accounts
    const accounts = await db.select({ id: sourceAccounts.id, name: sourceAccounts.name })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    if (accounts.length === 0) {
      return c.json({
        anomalies: [],
        summary: { total: 0, critical: 0, warning: 0, info: 0 },
        accountsAnalyzed: 0,
      })
    }

    try {
      const allAnomalies = []

      for (const account of accounts) {
        const anomalies = await anomalyDetectionService.detectAnomalies(account.id)
        allAnomalies.push(...anomalies.map(a => ({
          ...a,
          sourceAccountId: account.id,
          sourceAccountName: account.name,
        })))
      }

      // Group by severity
      const critical = allAnomalies.filter(a => a.severity === 'critical')
      const warning = allAnomalies.filter(a => a.severity === 'warning')
      const info = allAnomalies.filter(a => a.severity === 'info')

      return c.json({
        anomalies: allAnomalies,
        summary: {
          total: allAnomalies.length,
          critical: critical.length,
          warning: warning.length,
          info: info.length,
        },
        accountsAnalyzed: accounts.length,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg }, 'Failed to detect anomalies for all accounts')
      return c.json({ error: 'Failed to detect anomalies' }, 500)
    }
  })

  /**
   * Send alerts for detected anomalies
   * POST /optimizer/anomalies/:sourceAccountId/alert
   */
  .post('/:sourceAccountId/alert', async (c) => {
    const userId = c.get('userId')
    const sourceAccountId = c.req.param('sourceAccountId')

    // Verify user owns the source account
    const accounts = await db.select({ id: sourceAccounts.id })
      .from(sourceAccounts)
      .where(eq(sourceAccounts.userId, userId))

    const userAccountIds = accounts.map(a => a.id)
    if (!userAccountIds.includes(sourceAccountId)) {
      return c.json({ error: 'Source account not found' }, 404)
    }

    try {
      // Detect anomalies first
      const anomalies = await anomalyDetectionService.detectAnomalies(sourceAccountId)

      if (anomalies.length === 0) {
        return c.json({ message: 'No anomalies detected', alertsSent: 0 })
      }

      // Send alerts
      await anomalyDetectionService.sendAnomalyAlerts({
        userId,
        sourceAccountId,
        anomalies,
      })

      const criticalCount = anomalies.filter(a => a.severity === 'critical').length
      const alertsSent = Math.min(criticalCount, 3) // Max 3 alerts sent

      return c.json({
        message: 'Alerts sent',
        alertsSent,
        anomaliesDetected: anomalies.length,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMsg, sourceAccountId }, 'Failed to send anomaly alerts')
      return c.json({ error: 'Failed to send alerts' }, 500)
    }
  })
