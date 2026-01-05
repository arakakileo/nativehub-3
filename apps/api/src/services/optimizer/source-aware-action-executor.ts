/**
 * Source-Aware Action Executor
 *
 * Executes optimization actions against traffic sources via adapters:
 * - Respects rate limits per source
 * - Handles error categorization and retry logic
 * - Supports batch execution with rollback
 * - Logs all actions to database
 */

import { db } from '../../lib/db.js'
import { optimizerActions, widgetBlacklist } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import type { OptimizerAdapter, BlockResult, BidResult, SourceConstraints } from './adapters/interface.js'
import type { SourceAwareAction } from './source-aware-rule-engine.js'
import { logger } from '../../lib/logger.js'

/**
 * Error types for categorization
 */
export type ActionErrorType =
  | 'rate_limit' // Hit API rate limit
  | 'block_limit' // Hit max blocks for source
  | 'not_found' // Placement doesn't exist
  | 'permission' // Auth/permission error
  | 'validation' // Invalid action parameters
  | 'network' // Network/connectivity error
  | 'unsupported' // Action not supported by source
  | 'unknown' // Uncategorized error

/**
 * Result from action execution
 */
export interface ActionExecutionResult {
  actionId: string
  success: boolean
  placementId: string
  placementName: string
  actionType: string
  previousValue?: number
  newValue?: number
  error?: string
  errorType?: ActionErrorType
  retryable: boolean
  executedAt: Date
}

/**
 * Batch execution options
 */
export interface BatchExecutionOptions {
  /** Stop execution on first failure and rollback previous actions */
  stopOnFirstFailure?: boolean
  /** Simulate execution without making API calls */
  dryRun?: boolean
  /** Maximum retries for transient failures (default: 3) */
  maxRetries?: number
}

/**
 * Batch execution result
 */
export interface BatchExecutionResult {
  results: ActionExecutionResult[]
  summary: {
    total: number
    success: number
    failed: number
    skipped: number
  }
  rolledBack: boolean
}

/**
 * Categorize error based on message content
 */
export function categorizeError(error: Error | string): ActionErrorType {
  const message = (typeof error === 'string' ? error : error.message).toLowerCase()

  if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
    return 'rate_limit'
  }
  if (message.includes('maximum') || message.includes('limit exceeded') || message.includes('block limit')) {
    return 'block_limit'
  }
  if (message.includes('not found') || message.includes('404') || message.includes('does not exist')) {
    return 'not_found'
  }
  if (
    message.includes('unauthorized') ||
    message.includes('403') ||
    message.includes('401') ||
    message.includes('permission') ||
    message.includes('forbidden')
  ) {
    return 'permission'
  }
  if (message.includes('validation') || message.includes('invalid') || message.includes('bad request')) {
    return 'validation'
  }
  if (
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('timeout') ||
    message.includes('enotfound')
  ) {
    return 'network'
  }
  if (message.includes('not supported') || message.includes('unsupported')) {
    return 'unsupported'
  }

  return 'unknown'
}

/**
 * Check if error type is retryable
 */
export function isRetryableError(errorType: ActionErrorType): boolean {
  return ['rate_limit', 'network', 'unknown'].includes(errorType)
}

/**
 * Source-Aware Action Executor
 *
 * Executes actions via OptimizerAdapter with:
 * - Rate limit respect
 * - Error categorization
 * - Retry logic
 * - Batch execution with rollback
 */
export class SourceAwareActionExecutor {
  private constraints: SourceConstraints

  constructor(
    private adapter: OptimizerAdapter,
    private optimizerCampaignId: string,
    private externalCampaignId: string,
    private sourceAccountId: string
  ) {
    this.constraints = adapter.getConstraints()
  }

  /**
   * Execute a single action
   */
  async execute(action: SourceAwareAction): Promise<ActionExecutionResult> {
    const executedAt = new Date()

    // Skip actions that were already marked as skipped
    if (action.skipped) {
      return this.createSkippedResult(action, executedAt, action.skipReason ?? 'Skipped by rule engine')
    }

    // Validate action is supported
    if (
      (action.actionType === 'bid_increase' || action.actionType === 'bid_decrease') &&
      !this.constraints.supportsDirectBidAdjust
    ) {
      return this.createSkippedResult(
        action,
        executedAt,
        `Source ${this.adapter.sourceId} does not support placement-level bid adjustments`
      )
    }

    // Save action to DB first (pending state)
    const [savedAction] = await db
      .insert(optimizerActions)
      .values({
        optimizerCampaignId: this.optimizerCampaignId,
        ruleId: action.ruleId,
        actionType: action.actionType,
        targetType: action.targetType,
        targetId: action.placementId,
        targetName: action.placementName,
        previousValue: action.previousValue?.toString(),
        newValue: action.newValue?.toString(),
        reason: action.reason,
        metrics: action.metrics,
        confidenceScore: action.confidenceScore.toString(),
        executed: false,
      })
      .returning()

    try {
      // Execute the action
      await this.executeActionInternal(action)

      // Mark as executed
      await db
        .update(optimizerActions)
        .set({
          executed: true,
          executedAt,
        })
        .where(eq(optimizerActions.id, savedAction.id))

      logger.info(
        {
          actionId: savedAction.id,
          actionType: action.actionType,
          placementId: action.placementId,
          source: this.adapter.sourceId,
        },
        'Action executed successfully'
      )

      return {
        actionId: savedAction.id,
        success: true,
        placementId: action.placementId,
        placementName: action.placementName,
        actionType: action.actionType,
        previousValue: action.previousValue,
        newValue: action.newValue,
        retryable: false,
        executedAt,
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      const errorType = categorizeError(errorMessage)

      // Update action with error
      await db
        .update(optimizerActions)
        .set({
          executed: false,
          error: errorMessage,
        })
        .where(eq(optimizerActions.id, savedAction.id))

      logger.error(
        {
          actionId: savedAction.id,
          error: errorMessage,
          errorType,
          actionType: action.actionType,
          placementId: action.placementId,
        },
        'Action execution failed'
      )

      return {
        actionId: savedAction.id,
        success: false,
        placementId: action.placementId,
        placementName: action.placementName,
        actionType: action.actionType,
        previousValue: action.previousValue,
        newValue: action.newValue,
        error: errorMessage,
        errorType,
        retryable: isRetryableError(errorType),
        executedAt,
      }
    }
  }

  /**
   * Execute a single action with retry logic
   */
  async executeWithRetry(action: SourceAwareAction, maxRetries: number = 3): Promise<ActionExecutionResult> {
    let lastResult: ActionExecutionResult | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.execute(action)

      if (result.success || !result.retryable) {
        return result
      }

      lastResult = result

      // Don't retry on last attempt
      if (attempt < maxRetries) {
        // Exponential backoff for rate limits
        const backoffMs =
          result.errorType === 'rate_limit' ? Math.pow(2, attempt) * 1000 : attempt * 500

        logger.warn(
          {
            actionId: result.actionId,
            attempt,
            maxRetries,
            errorType: result.errorType,
            backoffMs,
          },
          'Retrying action after failure'
        )

        await this.delay(backoffMs)
      }
    }

    return lastResult!
  }

  /**
   * Execute batch of actions with options
   */
  async executeBatch(
    actions: SourceAwareAction[],
    options: BatchExecutionOptions = {}
  ): Promise<BatchExecutionResult> {
    const { stopOnFirstFailure = false, dryRun = false, maxRetries = 3 } = options

    const results: ActionExecutionResult[] = []
    let successCount = 0
    let failedCount = 0
    let skippedCount = 0
    let rolledBack = false

    // Filter out already skipped actions
    const actionsToExecute = actions.filter((a) => !a.skipped)
    const skippedActions = actions.filter((a) => a.skipped)

    // Add skipped action results
    for (const action of skippedActions) {
      results.push(this.createSkippedResult(action, new Date(), action.skipReason ?? 'Skipped by rule engine'))
      skippedCount++
    }

    // Execute actions sequentially to respect rate limits
    for (const action of actionsToExecute) {
      // Dry run - simulate execution
      if (dryRun) {
        const dryResult = this.createDryRunResult(action)
        results.push(dryResult)
        successCount++
        continue
      }

      // Execute with retry
      const result = await this.executeWithRetry(action, maxRetries)
      results.push(result)

      if (result.success) {
        successCount++
      } else {
        failedCount++

        if (stopOnFirstFailure) {
          // Rollback all previous successful actions
          const successfulResults = results.filter((r) => r.success)
          for (const successResult of successfulResults) {
            const rollbackSuccess = await this.rollback(successResult.actionId)
            if (!rollbackSuccess) {
              logger.error(
                { actionId: successResult.actionId },
                'Failed to rollback action during batch failure'
              )
            }
          }
          rolledBack = true
          break
        }
      }

      // Rate limit delay between actions
      await this.applyRateLimitDelay()
    }

    logger.info(
      {
        source: this.adapter.sourceId,
        campaignId: this.externalCampaignId,
        total: actions.length,
        success: successCount,
        failed: failedCount,
        skipped: skippedCount,
        rolledBack,
        dryRun,
      },
      'Batch execution complete'
    )

    return {
      results,
      summary: {
        total: actions.length,
        success: successCount,
        failed: failedCount,
        skipped: skippedCount,
      },
      rolledBack,
    }
  }

  /**
   * Rollback an executed action
   */
  async rollback(actionId: string): Promise<boolean> {
    const action = await db.query.optimizerActions.findFirst({
      where: (t, { eq }) => eq(t.id, actionId),
    })

    if (!action || !action.executed) {
      logger.warn({ actionId }, 'Cannot rollback: action not found or not executed')
      return false
    }

    try {
      // For blacklist actions, we need to unblock
      if (action.actionType === 'blacklist' || action.actionType === 'pause') {
        // Note: Most sources don't have a direct unblock API via adapters yet
        // Mark as needing manual unblock
        await db
          .update(optimizerActions)
          .set({
            error: 'Rolled back - manual unblock may be required',
          })
          .where(eq(optimizerActions.id, actionId))

        // Remove from our local blacklist
        await db
          .delete(widgetBlacklist)
          .where(eq(widgetBlacklist.widgetId, action.targetId))

        logger.info({ actionId, targetId: action.targetId }, 'Blacklist action rolled back (local only)')
        return true
      }

      // For bid adjustments, restore previous value
      if (
        (action.actionType === 'bid_increase' || action.actionType === 'bid_decrease') &&
        action.previousValue !== null
      ) {
        const previousBid = parseFloat(action.previousValue)

        const result = await this.adapter.adjustPlacementBid({
          campaignId: this.externalCampaignId,
          placementId: action.targetId,
          newBid: previousBid,
        })

        if (result.success) {
          await db
            .update(optimizerActions)
            .set({
              error: 'Rolled back - bid restored to previous value',
            })
            .where(eq(optimizerActions.id, actionId))

          logger.info({ actionId, targetId: action.targetId, previousBid }, 'Bid action rolled back')
          return true
        } else {
          logger.error({ actionId, error: result.error }, 'Failed to rollback bid action')
          return false
        }
      }

      return false
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      logger.error({ actionId, error: errorMessage }, 'Rollback failed')
      return false
    }
  }

  /**
   * Internal action execution
   */
  private async executeActionInternal(action: SourceAwareAction): Promise<void> {
    switch (action.actionType) {
      case 'blacklist':
      case 'pause': {
        const result = await this.adapter.blockPlacement({
          campaignId: this.externalCampaignId,
          placementId: action.placementId,
          reason: action.reason,
        })

        if (!result.success) {
          throw new Error(result.error ?? 'Block operation failed')
        }

        // Save to local blacklist table
        await db
          .insert(widgetBlacklist)
          .values({
            sourceAccountId: this.sourceAccountId,
            externalCampaignId: this.externalCampaignId,
            widgetId: action.placementId,
            widgetDomain: action.placementName,
            reason: action.reason,
            autoBlacklisted: true,
            metricsAtBlacklist: action.metrics,
          })
          .onConflictDoNothing()
        break
      }

      case 'bid_increase':
      case 'bid_decrease': {
        if (action.newValue === undefined) {
          throw new Error('No new bid value specified')
        }

        const result = await this.adapter.adjustPlacementBid({
          campaignId: this.externalCampaignId,
          placementId: action.placementId,
          newBid: action.newValue,
          previousBid: action.previousValue,
        })

        if (!result.success) {
          throw new Error(result.error ?? 'Bid adjustment failed')
        }
        break
      }

      default:
        throw new Error(`Unsupported action type: ${action.actionType}`)
    }
  }

  /**
   * Apply rate limit delay based on source constraints
   */
  private async applyRateLimitDelay(): Promise<void> {
    const { rateLimit } = this.constraints

    if (rateLimit.requestsPerSecond) {
      await this.delay(1000 / rateLimit.requestsPerSecond)
    } else if (rateLimit.requestsPerMinute) {
      await this.delay(60000 / rateLimit.requestsPerMinute)
    }
  }

  /**
   * Create result for skipped action
   */
  private createSkippedResult(
    action: SourceAwareAction,
    executedAt: Date,
    reason: string
  ): ActionExecutionResult {
    return {
      actionId: `skipped-${action.placementId}`,
      success: false,
      placementId: action.placementId,
      placementName: action.placementName,
      actionType: action.actionType,
      error: reason,
      errorType: 'validation',
      retryable: false,
      executedAt,
    }
  }

  /**
   * Create result for dry run
   */
  private createDryRunResult(action: SourceAwareAction): ActionExecutionResult {
    return {
      actionId: `dry-run-${action.placementId}`,
      success: true,
      placementId: action.placementId,
      placementName: action.placementName,
      actionType: action.actionType,
      previousValue: action.previousValue,
      newValue: action.newValue,
      retryable: false,
      executedAt: new Date(),
    }
  }

  /**
   * Helper for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
