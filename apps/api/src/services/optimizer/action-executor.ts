import { db } from '../../lib/db.js'
import { optimizerActions, widgetBlacklist } from '../../db/schema.js'
import { getAuthenticatedSource } from '../../traffic-sources/index.js'
import type { GeneratedAction } from './rule-engine.js'
import { logger } from '../../lib/logger.js'

/**
 * Execution result for an action
 */
export interface ExecutionResult {
  actionId: string
  success: boolean
  error?: string
}

/**
 * Action Executor - Executes optimizer actions against traffic sources
 */
export class ActionExecutor {
  /**
   * Execute a batch of generated actions
   */
  async executeActions(
    actions: GeneratedAction[],
    optimizerCampaignId: string,
    sourceAccountId: string,
    campaignId: string
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = []

    // Get authenticated source
    let source
    try {
      source = await getAuthenticatedSource(sourceAccountId)
    } catch (error) {
      logger.error({ error, sourceAccountId }, 'Failed to authenticate source for action execution')
      // Mark all actions as failed
      for (const action of actions) {
        const [savedAction] = await db.insert(optimizerActions).values({
          optimizerCampaignId,
          ruleId: action.ruleId,
          actionType: action.actionType,
          targetType: action.targetType,
          targetId: action.targetId,
          targetName: action.targetName,
          previousValue: action.previousValue?.toString(),
          newValue: action.newValue?.toString(),
          reason: action.reason,
          metrics: action.metrics,
          confidenceScore: action.confidenceScore.toString(),
          executed: false,
          error: 'Failed to authenticate source',
        }).returning()

        results.push({ actionId: savedAction.id, success: false, error: 'Failed to authenticate source' })
      }
      return results
    }

    // Execute each action
    for (const action of actions) {
      // Save action to DB first
      const [savedAction] = await db.insert(optimizerActions).values({
        optimizerCampaignId,
        ruleId: action.ruleId,
        actionType: action.actionType,
        targetType: action.targetType,
        targetId: action.targetId,
        targetName: action.targetName,
        previousValue: action.previousValue?.toString(),
        newValue: action.newValue?.toString(),
        reason: action.reason,
        metrics: action.metrics,
        confidenceScore: action.confidenceScore.toString(),
        executed: false,
      }).returning()

      try {
        await this.executeAction(action, source, campaignId, sourceAccountId)

        // Mark as executed
        await db.update(optimizerActions)
          .set({
            executed: true,
            executedAt: new Date(),
          })
          .where(eq(optimizerActions.id, savedAction.id))

        results.push({ actionId: savedAction.id, success: true })

        logger.info(
          { actionId: savedAction.id, actionType: action.actionType, targetId: action.targetId },
          'Action executed successfully'
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        await db.update(optimizerActions)
          .set({
            executed: false,
            error: errorMessage,
          })
          .where(eq(optimizerActions.id, savedAction.id))

        results.push({ actionId: savedAction.id, success: false, error: errorMessage })

        logger.error(
          { actionId: savedAction.id, error: errorMessage, actionType: action.actionType },
          'Action execution failed'
        )
      }
    }

    return results
  }

  private async executeAction(
    action: GeneratedAction,
    source: Awaited<ReturnType<typeof getAuthenticatedSource>>,
    campaignId: string,
    sourceAccountId: string
  ): Promise<void> {
    switch (action.actionType) {
      case 'blacklist': {
        // Execute blacklist via traffic source
        const result = await source.blacklistWidget(campaignId, action.targetId)
        if (!result.success) {
          throw new Error(result.error || 'Blacklist failed')
        }

        // Also save to our blacklist table
        await db.insert(widgetBlacklist).values({
          sourceAccountId,
          externalCampaignId: campaignId,
          widgetId: action.targetId,
          widgetDomain: undefined, // Could extract from widget data
          reason: action.reason,
          autoBlacklisted: true,
          metricsAtBlacklist: action.metrics,
        }).onConflictDoNothing()
        break
      }

      case 'bid_increase':
      case 'bid_decrease': {
        if (action.newValue === undefined) {
          throw new Error('No new bid value specified')
        }
        const result = await source.adjustWidgetBid(campaignId, action.targetId, action.newValue)
        if (!result.success) {
          throw new Error(result.error || 'Bid adjustment failed')
        }
        break
      }

      case 'pause': {
        // For widgets, pause is essentially blacklist
        const result = await source.blacklistWidget(campaignId, action.targetId)
        if (!result.success) {
          throw new Error(result.error || 'Pause failed')
        }
        break
      }

      default:
        throw new Error(`Unsupported action type: ${action.actionType}`)
    }
  }
}

// Import eq for the update queries
import { eq } from 'drizzle-orm'
