/**
 * Widget Reactivation Service
 *
 * Manages the lifecycle of paused widgets:
 * 1. Queue widgets for reactivation after pause
 * 2. Process pending reactivations after cooldown
 * 3. Re-enable widgets with reduced bid
 */

import { db } from '../../lib/db.js'
import { widgetReactivationQueue, sourceAccounts } from '../../db/schema.js'
import { eq, and, lte } from 'drizzle-orm'
import { logger } from '../../lib/logger.js'
import { HIGH_TICKET_CONFIG } from './optimizer.service.js'
import { createOptimizerAdapter, hasOptimizerSupport } from './adapters/index.js'
import { getAuthenticatedSource } from '../../traffic-sources/index.js'

interface QueueParams {
  sourceAccountId: string
  externalCampaignId: string
  widgetId: string
  originalBid?: number
}

interface ProcessResult {
  processed: number
  reactivated: number
  failed: number
}

/**
 * Reactivation Service - Manages widget cooldown and reactivation
 */
class ReactivationService {
  private COOLDOWN_DAYS = HIGH_TICKET_CONFIG.reactivationCooldownDays
  private BID_REDUCTION = HIGH_TICKET_CONFIG.reactivationBidReduction

  /**
   * Queue a widget for reactivation after cooldown period
   */
  async queueForReactivation(params: QueueParams): Promise<void> {
    const { sourceAccountId, externalCampaignId, widgetId, originalBid } = params

    const now = new Date()
    const reactivateAfter = new Date(
      now.getTime() + this.COOLDOWN_DAYS * 24 * 60 * 60 * 1000
    )

    // Calculate reduced bid (50% of original)
    const reactivateBid = originalBid
      ? (originalBid * this.BID_REDUCTION).toFixed(4)
      : null

    // Upsert: update if exists, insert if new
    await db
      .insert(widgetReactivationQueue)
      .values({
        sourceAccountId,
        externalCampaignId,
        widgetId,
        originalBid: originalBid?.toString(),
        reactivateBid,
        pausedAt: now,
        reactivateAfter,
        status: 'pending',
      })
      .onConflictDoUpdate({
        target: [
          widgetReactivationQueue.sourceAccountId,
          widgetReactivationQueue.externalCampaignId,
          widgetReactivationQueue.widgetId,
        ],
        set: {
          pausedAt: now,
          reactivateAfter,
          originalBid: originalBid?.toString(),
          reactivateBid,
          status: 'pending',
          reactivatedAt: null,
          failReason: null,
        },
      })

    logger.info(
      { sourceAccountId, externalCampaignId, widgetId, reactivateAfter },
      'Widget queued for reactivation'
    )
  }

  /**
   * Process all pending reactivations that have passed cooldown
   */
  async processReactivations(): Promise<ProcessResult> {
    const now = new Date()

    // Get all pending reactivations past cooldown
    const pending = await db
      .select()
      .from(widgetReactivationQueue)
      .where(
        and(
          eq(widgetReactivationQueue.status, 'pending'),
          lte(widgetReactivationQueue.reactivateAfter, now)
        )
      )

    logger.info({ count: pending.length }, 'Processing pending reactivations')

    let reactivated = 0
    let failed = 0

    for (const item of pending) {
      try {
        // Get source account to determine source type
        const [account] = await db
          .select()
          .from(sourceAccounts)
          .where(eq(sourceAccounts.id, item.sourceAccountId))

        if (!account) {
          throw new Error('Source account not found')
        }

        const sourceId = account.sourceId

        // Check if source has optimizer adapter support
        if (!hasOptimizerSupport(sourceId)) {
          throw new Error(`Source ${sourceId} does not have optimizer adapter support`)
        }

        // Get authenticated source and create adapter
        const source = await getAuthenticatedSource(item.sourceAccountId)
        const adapter = createOptimizerAdapter(sourceId, source)

        // Re-enable the widget with reduced bid
        const newBid = item.reactivateBid ? parseFloat(item.reactivateBid) : undefined

        const result = await adapter.enablePlacement({
          campaignId: item.externalCampaignId,
          placementId: item.widgetId,
          bid: newBid,
        })

        if (result.success) {
          // Mark as reactivated
          await db
            .update(widgetReactivationQueue)
            .set({
              status: 'reactivated',
              reactivatedAt: now,
            })
            .where(eq(widgetReactivationQueue.id, item.id))

          reactivated++

          logger.info(
            {
              widgetId: item.widgetId,
              campaignId: item.externalCampaignId,
              newBid,
            },
            'Widget reactivated successfully'
          )
        } else {
          throw new Error(result.error || 'Unknown error during reactivation')
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'

        // Mark as failed
        await db
          .update(widgetReactivationQueue)
          .set({
            status: 'failed',
            failReason: errorMsg,
          })
          .where(eq(widgetReactivationQueue.id, item.id))

        failed++

        logger.error(
          {
            widgetId: item.widgetId,
            campaignId: item.externalCampaignId,
            error: errorMsg,
          },
          'Failed to reactivate widget'
        )
      }
    }

    const result = { processed: pending.length, reactivated, failed }
    logger.info(result, 'Reactivation processing complete')

    return result
  }

  /**
   * Cancel pending reactivation for a widget
   * Use when widget is manually blocked or excluded
   */
  async cancelReactivation(
    sourceAccountId: string,
    externalCampaignId: string,
    widgetId: string
  ): Promise<void> {
    await db
      .update(widgetReactivationQueue)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(widgetReactivationQueue.sourceAccountId, sourceAccountId),
          eq(widgetReactivationQueue.externalCampaignId, externalCampaignId),
          eq(widgetReactivationQueue.widgetId, widgetId),
          eq(widgetReactivationQueue.status, 'pending')
        )
      )

    logger.info(
      { sourceAccountId, externalCampaignId, widgetId },
      'Widget reactivation cancelled'
    )
  }

  /**
   * Get pending reactivations count
   */
  async getPendingCount(): Promise<number> {
    const result = await db
      .select()
      .from(widgetReactivationQueue)
      .where(eq(widgetReactivationQueue.status, 'pending'))

    return result.length
  }

  /**
   * Get reactivation queue items for a campaign
   */
  async getQueueForCampaign(
    sourceAccountId: string,
    externalCampaignId: string
  ) {
    return db
      .select()
      .from(widgetReactivationQueue)
      .where(
        and(
          eq(widgetReactivationQueue.sourceAccountId, sourceAccountId),
          eq(widgetReactivationQueue.externalCampaignId, externalCampaignId)
        )
      )
  }
}

export const reactivationService = new ReactivationService()
