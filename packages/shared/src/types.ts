import { z } from 'zod'

// Traffic source identifiers
export type TrafficSourceId = 'revcontent' | 'taboola' | 'outbrain' | 'mgid'

export const TRAFFIC_SOURCES: readonly TrafficSourceId[] = [
  'revcontent',
  'taboola',
  'outbrain',
  'mgid'
] as const

// Source account status
export type SourceAccountStatus = 'pending' | 'connected' | 'error' | 'revoked'

// Campaign status
export type CampaignStatus = 'active' | 'paused' | 'deleted' | 'pending'

// Normalized campaign metrics
export interface CampaignMetrics {
  spend: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpa: number
  cpc: number
}

// Normalized campaign
export interface NormalizedCampaign {
  id: string
  externalId: string
  sourceId: TrafficSourceId
  sourceAccountId: string
  name: string
  status: CampaignStatus
  enabled: boolean
  budget: number | 'unlimited'
  bid: number
  metrics: CampaignMetrics
  createdAt: string
  updatedAt: string
}

// Normalized widget
export interface NormalizedWidget {
  id: string
  externalId: string
  campaignId: string
  name: string
  domain?: string
  enabled: boolean
  metrics: CampaignMetrics
}

// API response wrapper
export interface ApiResponse<T> {
  data: T
  meta?: {
    total?: number
    page?: number
    perPage?: number
  }
}

// Error response
export interface ApiError {
  error: string
  code?: string
  details?: Record<string, unknown>
}

// Optimizer action types
export type OptimizerActionType =
  | 'blacklist'
  | 'whitelist'
  | 'bid_increase'
  | 'bid_decrease'
  | 'pause'
  | 'enable'
  | 'alert' // For notification-only rules (WhatsApp/email)

// Optimizer target types
export type OptimizerTargetType = 'widget' | 'campaign' | 'content'

// Rule condition operators
export type ConditionOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'

// Rule condition
export interface RuleCondition {
  metric: keyof CampaignMetrics | 'spend'
  operator: ConditionOperator
  value: number
  timeframe?: '1d' | '3d' | '7d' | '14d' | '30d'
}

// Compound condition
export interface CompoundCondition {
  and?: (RuleCondition | CompoundCondition)[]
  or?: (RuleCondition | CompoundCondition)[]
}

// Rule action
export interface RuleAction {
  type: OptimizerActionType
  value?: number | string // number for bid adjustments, string for alert types
}

// Optimizer rule
export interface OptimizerRule {
  id: string
  name: string
  enabled: boolean
  priority: number
  ruleType: 'template' | 'custom'
  templateId?: string
  condition?: RuleCondition | CompoundCondition
  action: RuleAction
  createdAt: string
  updatedAt: string
}

// Optimizer action (history)
export interface OptimizerAction {
  id: string
  ruleId?: string
  actionType: OptimizerActionType
  targetType: OptimizerTargetType
  targetId: string
  targetName?: string
  previousValue?: number
  newValue?: number
  reason: string
  metrics: Partial<CampaignMetrics>
  executed: boolean
  executedAt?: string
  error?: string
  createdAt: string
}
