/**
 * A/B Testing Framework Service (MVP)
 *
 * Enables split-testing different optimization strategies:
 * - Create experiments with control/variant groups
 * - Assign campaigns to groups randomly
 * - Track performance metrics per group
 * - Calculate statistical significance
 */

import { db } from '../../lib/db.js'
import { optimizerCampaigns, campaignSyncs } from '../../db/schema.js'
import { logger } from '../../lib/logger.js'
import { eq, and, gte, inArray, sql, desc } from 'drizzle-orm'

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed'

export interface ExperimentVariant {
  id: string
  name: string
  description: string
  config: Record<string, unknown> // Rule overrides for this variant
  weight: number // Traffic allocation (0-100)
}

export interface Experiment {
  id: string
  name: string
  description: string
  status: ExperimentStatus
  sourceAccountId: string
  variants: ExperimentVariant[]
  campaignAssignments: Map<string, string> // campaignId -> variantId
  metrics: ExperimentMetrics
  startedAt: Date | null
  endedAt: Date | null
  createdAt: Date
}

export interface ExperimentMetrics {
  byVariant: Map<string, VariantMetrics>
  winner: string | null
  confidence: number
}

export interface VariantMetrics {
  variantId: string
  campaignCount: number
  totalSpend: number
  totalConversions: number
  totalClicks: number
  totalImpressions: number
  cpa: number
  ctr: number
  conversionRate: number
}

export interface ExperimentResult {
  experimentId: string
  winner: string | null
  confidence: number
  recommendation: string
  variants: Array<{
    id: string
    name: string
    metrics: VariantMetrics
    improvement: number // vs control
  }>
}

/**
 * A/B Testing Service
 * MVP: In-memory experiment storage (production would use database)
 */
export class ABTestingService {
  private experiments: Map<string, Experiment> = new Map()
  private readonly MIN_SAMPLE_SIZE = 100 // Minimum conversions for significance
  private readonly CONFIDENCE_THRESHOLD = 0.95 // 95% confidence

  /**
   * Create a new experiment
   */
  createExperiment(params: {
    name: string
    description: string
    sourceAccountId: string
    variants: Omit<ExperimentVariant, 'id'>[]
  }): Experiment {
    const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // Ensure control variant exists
    const variants: ExperimentVariant[] = params.variants.map((v, i) => ({
      ...v,
      id: i === 0 ? 'control' : `variant_${i}`,
    }))

    // Validate weights sum to 100
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0)
    if (totalWeight !== 100) {
      throw new Error(`Variant weights must sum to 100, got ${totalWeight}`)
    }

    const experiment: Experiment = {
      id,
      name: params.name,
      description: params.description,
      status: 'draft',
      sourceAccountId: params.sourceAccountId,
      variants,
      campaignAssignments: new Map(),
      metrics: {
        byVariant: new Map(),
        winner: null,
        confidence: 0,
      },
      startedAt: null,
      endedAt: null,
      createdAt: new Date(),
    }

    this.experiments.set(id, experiment)
    logger.info({ experimentId: id, name: params.name }, 'Experiment created')

    return experiment
  }

  /**
   * Start an experiment (assign campaigns to variants)
   */
  async startExperiment(experimentId: string): Promise<Experiment> {
    const experiment = this.experiments.get(experimentId)
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`)
    }

    if (experiment.status !== 'draft' && experiment.status !== 'paused') {
      throw new Error(`Cannot start experiment in ${experiment.status} status`)
    }

    // Get all active campaigns for this source account
    const campaigns = await db
      .select({ id: optimizerCampaigns.id, externalCampaignId: optimizerCampaigns.externalCampaignId })
      .from(optimizerCampaigns)
      .where(and(
        eq(optimizerCampaigns.sourceAccountId, experiment.sourceAccountId),
        eq(optimizerCampaigns.enabled, true)
      ))

    // Randomly assign campaigns to variants based on weights
    for (const campaign of campaigns) {
      const variantId = this.selectVariant(experiment.variants)
      experiment.campaignAssignments.set(campaign.externalCampaignId, variantId)
    }

    experiment.status = 'running'
    experiment.startedAt = new Date()

    logger.info({
      experimentId,
      campaignCount: campaigns.length,
      assignments: Object.fromEntries(experiment.campaignAssignments),
    }, 'Experiment started')

    return experiment
  }

  /**
   * Select variant based on weights
   */
  private selectVariant(variants: ExperimentVariant[]): string {
    const rand = Math.random() * 100
    let cumulative = 0

    for (const variant of variants) {
      cumulative += variant.weight
      if (rand < cumulative) {
        return variant.id
      }
    }

    return variants[variants.length - 1].id
  }

  /**
   * Get variant configuration for a campaign
   */
  getVariantConfig(experimentId: string, campaignId: string): Record<string, unknown> | null {
    const experiment = this.experiments.get(experimentId)
    if (!experiment || experiment.status !== 'running') {
      return null
    }

    const variantId = experiment.campaignAssignments.get(campaignId)
    if (!variantId) {
      return null
    }

    const variant = experiment.variants.find(v => v.id === variantId)
    return variant?.config || null
  }

  /**
   * Calculate experiment results
   */
  async calculateResults(experimentId: string): Promise<ExperimentResult> {
    const experiment = this.experiments.get(experimentId)
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`)
    }

    const lookbackDays = 7
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - lookbackDays)

    // Group campaign IDs by variant
    const variantCampaigns = new Map<string, string[]>()
    for (const variant of experiment.variants) {
      variantCampaigns.set(variant.id, [])
    }
    for (const [campaignId, variantId] of experiment.campaignAssignments) {
      variantCampaigns.get(variantId)?.push(campaignId)
    }

    // Calculate metrics for each variant
    const variantResults: Array<{
      id: string
      name: string
      metrics: VariantMetrics
      improvement: number
    }> = []

    let controlMetrics: VariantMetrics | null = null

    for (const variant of experiment.variants) {
      const campaignIds = variantCampaigns.get(variant.id) || []

      if (campaignIds.length === 0) {
        continue
      }

      // Get performance data for this variant's campaigns
      const syncs = await db
        .select()
        .from(campaignSyncs)
        .where(and(
          eq(campaignSyncs.sourceAccountId, experiment.sourceAccountId),
          inArray(campaignSyncs.externalCampaignId, campaignIds),
          gte(campaignSyncs.syncedAt, startDate)
        ))

      const metrics: VariantMetrics = {
        variantId: variant.id,
        campaignCount: campaignIds.length,
        totalSpend: syncs.reduce((sum, s) => sum + Number(s.spend || 0), 0),
        totalConversions: syncs.reduce((sum, s) => sum + (s.conversions || 0), 0),
        totalClicks: syncs.reduce((sum, s) => sum + Number(s.clicks || 0), 0),
        totalImpressions: syncs.reduce((sum, s) => sum + Number(s.impressions || 0), 0),
        cpa: 0,
        ctr: 0,
        conversionRate: 0,
      }

      // Calculate derived metrics
      if (metrics.totalConversions > 0) {
        metrics.cpa = metrics.totalSpend / metrics.totalConversions
      }
      if (metrics.totalImpressions > 0) {
        metrics.ctr = (metrics.totalClicks / metrics.totalImpressions) * 100
      }
      if (metrics.totalClicks > 0) {
        metrics.conversionRate = (metrics.totalConversions / metrics.totalClicks) * 100
      }

      experiment.metrics.byVariant.set(variant.id, metrics)

      if (variant.id === 'control') {
        controlMetrics = metrics
      }

      variantResults.push({
        id: variant.id,
        name: variant.name,
        metrics,
        improvement: 0, // Will calculate below
      })
    }

    // Calculate improvement vs control
    if (controlMetrics && controlMetrics.cpa > 0) {
      for (const result of variantResults) {
        if (result.id !== 'control' && result.metrics.cpa > 0) {
          result.improvement = ((controlMetrics.cpa - result.metrics.cpa) / controlMetrics.cpa) * 100
        }
      }
    }

    // Determine winner and confidence
    const { winner, confidence } = this.determineWinner(variantResults, controlMetrics)

    experiment.metrics.winner = winner
    experiment.metrics.confidence = confidence

    // Generate recommendation
    let recommendation = 'Insufficient data for recommendation'
    if (winner && confidence >= this.CONFIDENCE_THRESHOLD) {
      const winnerResult = variantResults.find(v => v.id === winner)
      if (winnerResult) {
        if (winner === 'control') {
          recommendation = 'Control is winning. Keep current configuration.'
        } else {
          recommendation = `Variant "${winnerResult.name}" shows ${winnerResult.improvement.toFixed(1)}% improvement. Consider adopting this configuration.`
        }
      }
    } else if (confidence > 0) {
      recommendation = `Confidence is ${(confidence * 100).toFixed(0)}%. Continue running experiment for more data.`
    }

    logger.info({
      experimentId,
      winner,
      confidence,
      variantCount: variantResults.length,
    }, 'Experiment results calculated')

    return {
      experimentId,
      winner,
      confidence,
      recommendation,
      variants: variantResults,
    }
  }

  /**
   * Determine winner using simple statistical comparison
   * MVP: Uses conversion rate comparison with sample size check
   */
  private determineWinner(
    variants: Array<{ id: string; metrics: VariantMetrics; improvement: number }>,
    controlMetrics: VariantMetrics | null
  ): { winner: string | null; confidence: number } {
    if (!controlMetrics || variants.length < 2) {
      return { winner: null, confidence: 0 }
    }

    // Check minimum sample size
    const totalConversions = variants.reduce((sum, v) => sum + v.metrics.totalConversions, 0)
    if (totalConversions < this.MIN_SAMPLE_SIZE) {
      return { winner: null, confidence: 0 }
    }

    // Find best performer by CPA (lower is better)
    let bestVariant = variants[0]
    for (const variant of variants) {
      if (variant.metrics.cpa > 0 && variant.metrics.cpa < bestVariant.metrics.cpa) {
        bestVariant = variant
      }
    }

    // Calculate approximate confidence using simplified z-test
    // MVP: This is a simplified calculation
    const confidence = this.calculateConfidence(
      controlMetrics.totalConversions,
      controlMetrics.totalClicks,
      bestVariant.metrics.totalConversions,
      bestVariant.metrics.totalClicks
    )

    return {
      winner: confidence >= 0.8 ? bestVariant.id : null,
      confidence,
    }
  }

  /**
   * Simplified confidence calculation
   * Based on conversion rate z-test
   */
  private calculateConfidence(
    controlConversions: number,
    controlClicks: number,
    variantConversions: number,
    variantClicks: number
  ): number {
    if (controlClicks === 0 || variantClicks === 0) {
      return 0
    }

    const p1 = controlConversions / controlClicks
    const p2 = variantConversions / variantClicks

    const pooledP = (controlConversions + variantConversions) / (controlClicks + variantClicks)
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / controlClicks + 1 / variantClicks))

    if (se === 0) {
      return 0
    }

    const z = Math.abs(p1 - p2) / se

    // Convert z-score to confidence (simplified)
    // z = 1.96 -> 95%, z = 2.58 -> 99%
    if (z >= 2.58) return 0.99
    if (z >= 1.96) return 0.95
    if (z >= 1.64) return 0.90
    if (z >= 1.28) return 0.80

    return Math.min(0.79, z / 1.64 * 0.9)
  }

  /**
   * Stop an experiment
   */
  stopExperiment(experimentId: string): Experiment {
    const experiment = this.experiments.get(experimentId)
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`)
    }

    experiment.status = 'completed'
    experiment.endedAt = new Date()

    logger.info({ experimentId }, 'Experiment stopped')
    return experiment
  }

  /**
   * Pause an experiment
   */
  pauseExperiment(experimentId: string): Experiment {
    const experiment = this.experiments.get(experimentId)
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`)
    }

    if (experiment.status !== 'running') {
      throw new Error(`Cannot pause experiment in ${experiment.status} status`)
    }

    experiment.status = 'paused'
    logger.info({ experimentId }, 'Experiment paused')
    return experiment
  }

  /**
   * Get experiment by ID
   */
  getExperiment(experimentId: string): Experiment | null {
    return this.experiments.get(experimentId) || null
  }

  /**
   * List experiments for a source account
   */
  listExperiments(sourceAccountId: string): Experiment[] {
    return Array.from(this.experiments.values())
      .filter(e => e.sourceAccountId === sourceAccountId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  /**
   * Delete an experiment
   */
  deleteExperiment(experimentId: string): boolean {
    const experiment = this.experiments.get(experimentId)
    if (!experiment) {
      return false
    }

    if (experiment.status === 'running') {
      throw new Error('Cannot delete running experiment. Stop it first.')
    }

    this.experiments.delete(experimentId)
    logger.info({ experimentId }, 'Experiment deleted')
    return true
  }
}

// Singleton instance
export const abTestingService = new ABTestingService()
