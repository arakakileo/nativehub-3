import { ApiError } from './api-error.js'

/**
 * Make an authenticated HTTP request
 */
export async function makeRequest<T>(
  url: string,
  options: RequestInit & { accessToken?: string } = {}
): Promise<T> {
  const { accessToken, ...fetchOptions } = options

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (accessToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    // Log the full error details for debugging
    console.error('API Error Response:', { status: response.status, url, body })
    throw ApiError.fromResponse(response, body)
  }

  return body as T
}

/**
 * Build URL with query parameters
 * Note: Properly appends path to baseUrl (doesn't replace base path)
 */
export function buildUrl(baseUrl: string, path: string, params?: Record<string, string | number | undefined>): string {
  // Remove trailing slash from base and leading slash from path to avoid double slashes
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const cleanPath = path.startsWith('/') ? path.slice(1) : path

  const url = new URL(`${cleanBase}/${cleanPath}`)

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
  }

  return url.toString()
}

/**
 * Parse pagination from response headers
 */
export interface PaginationInfo {
  page: number
  perPage: number
  total: number
  hasMore: boolean
}

export function parsePagination(headers: Headers, defaultPerPage = 100): PaginationInfo {
  const total = parseInt(headers.get('x-total-count') || '0', 10)
  const page = parseInt(headers.get('x-page') || '1', 10)
  const perPage = parseInt(headers.get('x-per-page') || String(defaultPerPage), 10)

  return {
    page,
    perPage,
    total,
    hasMore: page * perPage < total,
  }
}

/**
 * Extract standardized metrics from API response data
 */
export interface MetricsData {
  spend?: number
  spent?: number
  impressions?: number
  clicks?: number
  conversions?: number
  cpc?: number
}

export interface CampaignMetrics {
  spend: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpa: number
  cpc: number
}

export function extractMetrics(data: MetricsData): CampaignMetrics {
  const spend = data.spent || data.spend || 0
  const impressions = data.impressions || 0
  const clicks = data.clicks || 0
  const conversions = data.conversions || 0

  return {
    spend,
    impressions,
    clicks,
    conversions,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpa: conversions > 0 ? spend / conversions : 0,
    cpc: data.cpc || (clicks > 0 ? spend / clicks : 0),
  }
}
