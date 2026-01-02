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

  // Campaigns
  getCampaigns = (sourceAccountId?: string): Promise<Campaign[]> => {
    const query = sourceAccountId ? `?sourceAccountId=${sourceAccountId}` : ''
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

  runOptimizer = (): Promise<{ actionsCount: number }> =>
    this.request('/api/v1/optimizer/run', { method: 'POST' })
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
  credentials: Record<string, string>
}

export interface Campaign {
  id: string
  sourceAccountId: string
  externalId: string
  name: string
  status: 'active' | 'paused' | 'deleted'
  source: string
  bidAmount?: number
  budget?: number
  spend?: number
  impressions?: number
  clicks?: number
  conversions?: number
  ctr?: number
  cpc?: number
  cpa?: number
  createdAt: string
  updatedAt: string
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
  ruleId: string
  actionType: string
  targetType: string
  targetId: string
  previousValue?: unknown
  newValue?: unknown
  status: 'pending' | 'executed' | 'failed'
  executedAt?: string
  error?: string
  createdAt: string
}
