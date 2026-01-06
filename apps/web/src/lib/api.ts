/// <reference types="vite/client" />

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

class ApiClient {
  private token: string | null = null

  setToken(token: string | null) {
    this.token = token
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    }

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    })

    const body = await response.json().catch(() => null)

    if (!response.ok) {
      throw new ApiError(
        body?.error || 'Request failed',
        response.status,
        body?.code
      )
    }

    return body?.data ?? body
  }

  // Source Accounts
  getSourceAccounts = (): Promise<SourceAccount[]> =>
    this.request('/api/v1/source-accounts')

  getSourceAccount = (id: string): Promise<SourceAccount> =>
    this.request(`/api/v1/source-accounts/${id}`)

  createSourceAccount = (data: CreateSourceAccountInput): Promise<SourceAccount> =>
    this.request('/api/v1/source-accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  updateSourceAccount = (id: string, data: Partial<CreateSourceAccountInput>): Promise<SourceAccount> =>
    this.request(`/api/v1/source-accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })

  deleteSourceAccount = (id: string): Promise<void> =>
    this.request(`/api/v1/source-accounts/${id}`, { method: 'DELETE' })

  syncSourceAccount = (id: string): Promise<{ success: boolean }> =>
    this.request(`/api/v1/source-accounts/${id}/sync`, { method: 'POST' })

  testSourceAccount = (id: string): Promise<{ success: boolean; message?: string }> =>
    this.request(`/api/v1/source-accounts/${id}/test`, { method: 'POST' })

  // Campaigns
  getCampaigns = (filters?: CampaignFilters): Promise<Campaign[]> => {
    const params = new URLSearchParams()
    if (filters?.sourceAccountId) params.set('sourceAccountId', filters.sourceAccountId)
    if (filters?.from) params.set('from', filters.from)
    if (filters?.to) params.set('to', filters.to)
    if (filters?.status) params.set('status', filters.status)
    if (filters?.sortBy) params.set('sortBy', filters.sortBy)
    if (filters?.sortOrder) params.set('sortOrder', filters.sortOrder)

    const query = params.toString() ? `?${params.toString()}` : ''
    return this.request(`/api/v1/campaigns${query}`)
  }

  getCampaign = (id: string): Promise<Campaign> =>
    this.request(`/api/v1/campaigns/${id}`)

  updateCampaign = (id: string, data: { status?: string; bidAmount?: number }): Promise<Campaign> =>
    this.request(`/api/v1/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })

  // Widget Blacklist
  getBlacklist = (): Promise<BlacklistEntry[]> =>
    this.request('/api/v1/widgets/blacklist')

  addToBlacklist = (data: { widgetId: string; sourceId: string; reason?: string }): Promise<BlacklistEntry> =>
    this.request('/api/v1/widgets/blacklist', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  removeFromBlacklist = (id: string): Promise<void> =>
    this.request(`/api/v1/widgets/blacklist/${id}`, { method: 'DELETE' })

  // Optimizer
  getOptimizerRules = (): Promise<OptimizerRule[]> =>
    this.request('/api/v1/optimizer/rules')

  createOptimizerRule = (data: Omit<OptimizerRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<OptimizerRule> =>
    this.request('/api/v1/optimizer/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  updateOptimizerRule = (id: string, data: Partial<OptimizerRule>): Promise<OptimizerRule> =>
    this.request(`/api/v1/optimizer/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })

  deleteOptimizerRule = (id: string): Promise<void> =>
    this.request(`/api/v1/optimizer/rules/${id}`, { method: 'DELETE' })

  getOptimizerActions = (): Promise<OptimizerAction[]> =>
    this.request('/api/v1/optimizer/actions')

  runOptimizer = (): Promise<{ actionsCount: number; campaignsProcessed: number }> =>
    this.request('/api/v1/optimizer/run', { method: 'POST' })

  // Optimizer Campaigns
  getOptimizerCampaigns = (): Promise<OptimizerCampaign[]> =>
    this.request('/api/v1/optimizer/campaigns')

  getOptimizerCampaign = (id: string): Promise<OptimizerCampaignDetail> =>
    this.request(`/api/v1/optimizer/campaigns/${id}`)

  createOptimizerCampaign = (data: CreateOptimizerCampaignInput): Promise<OptimizerCampaign> =>
    this.request('/api/v1/optimizer/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  updateOptimizerCampaign = (id: string, data: UpdateOptimizerCampaignInput): Promise<OptimizerCampaign> =>
    this.request(`/api/v1/optimizer/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })

  runOptimizerCampaign = (id: string): Promise<RunOptimizerResult> =>
    this.request(`/api/v1/optimizer/campaigns/${id}/run`, { method: 'POST' })

  getOptimizerCampaignActions = (id: string, limit?: number): Promise<OptimizerAction[]> => {
    const query = limit ? `?limit=${limit}` : ''
    return this.request(`/api/v1/optimizer/campaigns/${id}/actions${query}`)
  }

  // Optimizer Status
  getOptimizerStatus = (): Promise<OptimizerStatus> =>
    this.request('/api/v1/jobs/optimizer/status')

  // Widgets (with metrics from traffic source)
  getCampaignWidgets = (sourceAccountId: string, externalCampaignId: string): Promise<Widget[]> =>
    this.request(`/api/v1/campaigns/${sourceAccountId}/${externalCampaignId}/widgets`)

  // === Phase 5: Advanced Optimizer Features ===

  // Bid Recommendations
  getRecommendations = (campaignId: string, params: GetRecommendationsInput): Promise<BidRecommendation[]> =>
    this.request(`/api/v1/optimizer/recommendations/${campaignId}`, {
      method: 'POST',
      body: JSON.stringify(params),
    })

  getBulkRecommendations = (params: GetRecommendationsInput): Promise<BulkRecommendationsResponse> =>
    this.request('/api/v1/optimizer/recommendations', {
      method: 'POST',
      body: JSON.stringify(params),
    })

  // Anomaly Detection
  getAnomalies = (): Promise<AnomaliesResponse> =>
    this.request('/api/v1/optimizer/anomalies')

  getAccountAnomalies = (sourceAccountId: string): Promise<AnomaliesResponse> =>
    this.request(`/api/v1/optimizer/anomalies/${sourceAccountId}`)

  sendAnomalyAlerts = (sourceAccountId: string): Promise<{ alertsSent: number; anomaliesDetected: number }> =>
    this.request(`/api/v1/optimizer/anomalies/${sourceAccountId}/alert`, { method: 'POST' })

  // A/B Testing Experiments
  getExperiments = (): Promise<{ experiments: Experiment[] }> =>
    this.request('/api/v1/optimizer/experiments')

  getExperiment = (id: string): Promise<ExperimentDetail> =>
    this.request(`/api/v1/optimizer/experiments/${id}`)

  createExperiment = (data: CreateExperimentInput): Promise<Experiment> =>
    this.request('/api/v1/optimizer/experiments', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  startExperiment = (id: string): Promise<ExperimentDetail> =>
    this.request(`/api/v1/optimizer/experiments/${id}/start`, { method: 'POST' })

  pauseExperiment = (id: string): Promise<{ id: string; status: string }> =>
    this.request(`/api/v1/optimizer/experiments/${id}/pause`, { method: 'POST' })

  stopExperiment = (id: string): Promise<{ id: string; status: string; endedAt: string }> =>
    this.request(`/api/v1/optimizer/experiments/${id}/stop`, { method: 'POST' })

  getExperimentResults = (id: string): Promise<ExperimentResults> =>
    this.request(`/api/v1/optimizer/experiments/${id}/results`)

  deleteExperiment = (id: string): Promise<void> =>
    this.request(`/api/v1/optimizer/experiments/${id}`, { method: 'DELETE' })

  // Custom Automation Rules
  getCustomRules = (status?: 'active' | 'paused' | 'draft'): Promise<{ rules: CustomRule[] }> => {
    const query = status ? `?status=${status}` : ''
    return this.request(`/api/v1/optimizer/custom-rules${query}`)
  }

  getCustomRule = (id: string): Promise<CustomRuleDetail> =>
    this.request(`/api/v1/optimizer/custom-rules/${id}`)

  createCustomRule = (data: CreateCustomRuleInput): Promise<CustomRuleDetail> =>
    this.request('/api/v1/optimizer/custom-rules', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  updateCustomRule = (id: string, data: UpdateCustomRuleInput): Promise<CustomRuleDetail> =>
    this.request(`/api/v1/optimizer/custom-rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })

  activateCustomRule = (id: string): Promise<{ id: string; status: string }> =>
    this.request(`/api/v1/optimizer/custom-rules/${id}/activate`, { method: 'POST' })

  pauseCustomRule = (id: string): Promise<{ id: string; status: string }> =>
    this.request(`/api/v1/optimizer/custom-rules/${id}/pause`, { method: 'POST' })

  cloneCustomRule = (id: string, name: string): Promise<CustomRuleDetail> =>
    this.request(`/api/v1/optimizer/custom-rules/${id}/clone`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    })

  deleteCustomRule = (id: string): Promise<void> =>
    this.request(`/api/v1/optimizer/custom-rules/${id}`, { method: 'DELETE' })

  validateCustomRule = (data: ValidateRuleInput): Promise<RuleValidationResult> =>
    this.request('/api/v1/optimizer/custom-rules/validate', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  getRuleTemplates = (): Promise<{ templates: RuleTemplate[] }> =>
    this.request('/api/v1/optimizer/custom-rules/templates')
}

export const api = new ApiClient()

// Types
export interface SourceAccount {
  id: string
  sourceId: 'revcontent' | 'taboola' | 'outbrain' | 'mgid'
  name: string
  status: 'pending' | 'connected' | 'error' | 'revoked'
  externalAccountId?: string
  lastSyncAt?: string
  lastError?: string
  createdAt: string
  updatedAt: string
}

export interface CreateSourceAccountInput {
  sourceId: 'revcontent' | 'taboola' | 'outbrain' | 'mgid'
  name: string
  clientId: string
  clientSecret?: string
  accountId?: string
  username?: string
  password?: string
}

export interface CampaignFilters {
  sourceAccountId?: string
  from?: string
  to?: string
  status?: 'active' | 'paused' | 'deleted' | 'all'
  sortBy?: 'name' | 'spend' | 'conversions' | 'clicks' | 'cpc'
  sortOrder?: 'asc' | 'desc'
}

export interface Campaign {
  id: string
  sourceAccountId: string
  externalCampaignId: string
  name: string
  status: 'active' | 'paused' | 'deleted'
  enabled: boolean
  budget?: string | null
  bid?: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpc: number
  cpa: number
  syncedAt: string
}

export interface BlacklistEntry {
  id: string
  widgetId: string
  sourceId: string
  reason?: string
  createdAt: string
}

export interface OptimizerRule {
  id: string
  name: string
  templateId?: string
  conditions: Record<string, unknown>
  actions: unknown[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface OptimizerAction {
  id: string
  ruleId?: string
  actionType: string
  targetType: string
  targetId: string
  targetName?: string
  previousValue?: number | null
  newValue?: number | null
  reason: string
  metrics: Record<string, number>
  confidenceScore?: number | null
  executed: boolean
  executedAt?: string
  error?: string
  createdAt: string
}

// Optimizer Campaign types
export interface OptimizerCampaign {
  id: string
  sourceAccountId: string
  externalCampaignId: string
  enabled: boolean
  targetCpa: number
  bidStrategy: 'target_cpa' | 'maximize_conversions' | 'manual'
  createdAt: string
  updatedAt: string
}

export interface OptimizerCampaignRule {
  id: string
  name: string
  enabled: boolean
  priority: number
  ruleType: 'template' | 'custom'
  templateId?: string
  condition?: Record<string, unknown>
  action: Record<string, unknown>
}

export interface OptimizerCampaignDetail extends OptimizerCampaign {
  bidStrategyConfig?: Record<string, unknown>
  customThresholds?: Record<string, unknown>
  rules: OptimizerCampaignRule[]
}

export interface CreateOptimizerCampaignInput {
  sourceAccountId: string
  externalCampaignId: string
  targetCpa: number
  bidStrategy?: 'target_cpa' | 'maximize_conversions' | 'manual'
}

export interface UpdateOptimizerCampaignInput {
  enabled?: boolean
  targetCpa?: number
  bidStrategy?: 'target_cpa' | 'maximize_conversions' | 'manual'
}

export interface RunOptimizerResult {
  campaignId: string
  actionsGenerated: number
  actionsExecuted: number
  actionsFailed: number
  skipped: boolean
}

export interface OptimizerStatus {
  status: 'ok' | 'error'
  scheduler: {
    active: boolean
    cron: string | null
    timezone: string | null
  }
  queue: {
    pending: number
    active: number
  }
  error?: string
}

// Widget types
export interface Widget {
  id: string
  externalId: string
  campaignId: string
  name: string
  domain?: string
  enabled: boolean
  metrics: {
    spend: number
    impressions: number
    clicks: number
    conversions: number
    ctr: number
    cpa: number
    cpc: number
  }
}

// === Phase 5: Advanced Optimizer Types ===

// Bid Recommendations
export interface GetRecommendationsInput {
  sourceAccountId: string
  targetCpa?: number
  maxBidChange?: number
}

export interface BidRecommendation {
  campaignId: string
  campaignName: string
  currentBid: number
  recommendedBid: number
  bidChange: number
  bidChangePercent: number
  reason: string
  confidence: number
  expectedImpact: {
    cpaChange: number
    conversionsChange: number
  }
  metrics: {
    spend: number
    conversions: number
    clicks: number
    cpa: number
    ctr: number
  }
}

export interface BulkRecommendationsResponse {
  recommendations: Array<{
    campaignId: string
    recommendations: BidRecommendation[]
  }>
  summary: {
    totalCampaigns: number
    campaignsWithRecommendations: number
    avgConfidence: number
  }
}

// Anomaly Detection
export interface Anomaly {
  id: string
  campaignId: string
  campaignName: string
  type: 'spend_spike' | 'conversion_drop' | 'ctr_anomaly' | 'cpa_spike'
  severity: 'info' | 'warning' | 'critical'
  metric: string
  currentValue: number
  expectedValue: number
  deviation: number
  message: string
  detectedAt: string
  sourceAccountId?: string
  sourceAccountName?: string
}

export interface AnomaliesResponse {
  anomalies: Anomaly[]
  summary: {
    total: number
    critical: number
    warning: number
    info: number
  }
  accountsAnalyzed?: number
  sourceAccountId?: string
}

// A/B Testing Experiments
export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed'

export interface ExperimentVariant {
  id: string
  name: string
  description: string
  config: Record<string, unknown>
  weight: number
}

export interface Experiment {
  id: string
  name: string
  description: string
  status: ExperimentStatus
  sourceAccountId: string
  variantCount: number
  campaignCount: number
  startedAt?: string
  endedAt?: string
  createdAt: string
}

export interface ExperimentDetail extends Experiment {
  variants: ExperimentVariant[]
  campaignAssignments: Record<string, string>
  metrics: {
    byVariant: Record<string, {
      spend: number
      conversions: number
      cpa: number
      sampleSize: number
    }>
    winner?: string
    confidence?: number
  }
}

export interface CreateExperimentInput {
  name: string
  description?: string
  sourceAccountId: string
  variants: Array<{
    name: string
    description?: string
    config?: Record<string, unknown>
    weight: number
  }>
}

export interface ExperimentResults {
  experimentId: string
  status: ExperimentStatus
  variants: Array<{
    id: string
    name: string
    metrics: {
      spend: number
      conversions: number
      cpa: number
      sampleSize: number
    }
    isWinner: boolean
  }>
  winner?: string
  confidence: number
  recommendation: string
}

// Custom Automation Rules
export type RuleConditionOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between'
export type RuleConditionMetric = 'spend' | 'cpa' | 'conversions' | 'clicks' | 'impressions' | 'ctr' | 'roas'
export type RuleActionType = 'pause' | 'enable' | 'adjust_bid' | 'notify' | 'tag'
export type RuleLogic = 'and' | 'or'
export type RuleStatus = 'active' | 'paused' | 'draft'

export interface RuleCondition {
  id?: string
  metric: RuleConditionMetric
  operator: RuleConditionOperator
  value: number
  value2?: number
  timeframe: 'today' | 'yesterday' | 'last_3_days' | 'last_7_days' | 'last_14_days' | 'last_30_days'
}

export interface RuleAction {
  id?: string
  type: RuleActionType
  params: {
    bidChangePercent?: number
    bidChangeAbsolute?: number
    notificationMessage?: string
    tag?: string
  }
}

export interface CustomRule {
  id: string
  name: string
  description: string
  status: RuleStatus
  priority: number
  sourceAccountId: string
  conditionCount: number
  actionCount: number
  conditionLogic: RuleLogic
  stats: {
    timesTriggered: number
    lastTriggeredAt: string | null
    actionsExecuted: number
  }
  createdAt: string
  updatedAt: string
}

export interface CustomRuleDetail extends Omit<CustomRule, 'conditionCount' | 'actionCount'> {
  conditions: RuleCondition[]
  actions: RuleAction[]
  schedule: {
    enabled: boolean
    cron?: string
    timezone?: string
  }
  limits: {
    maxActionsPerDay: number
    cooldownMinutes: number
  }
}

export interface CreateCustomRuleInput {
  name: string
  description?: string
  sourceAccountId: string
  conditions: Omit<RuleCondition, 'id'>[]
  conditionLogic?: RuleLogic
  actions: Omit<RuleAction, 'id'>[]
  schedule?: {
    enabled: boolean
    cron?: string
    timezone?: string
  }
  limits?: {
    maxActionsPerDay?: number
    cooldownMinutes?: number
  }
  priority?: number
}

export interface UpdateCustomRuleInput {
  name?: string
  description?: string
  conditions?: Omit<RuleCondition, 'id'>[]
  conditionLogic?: RuleLogic
  actions?: Omit<RuleAction, 'id'>[]
  schedule?: {
    enabled: boolean
    cron?: string
    timezone?: string
  }
  limits?: {
    maxActionsPerDay?: number
    cooldownMinutes?: number
  }
  priority?: number
}

export interface ValidateRuleInput {
  conditions: Omit<RuleCondition, 'id'>[]
  actions: Omit<RuleAction, 'id'>[]
}

export interface RuleValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface RuleTemplate {
  id: string
  name: string
  description: string
  conditions: Omit<RuleCondition, 'id'>[]
  actions: Omit<RuleAction, 'id'>[]
}
