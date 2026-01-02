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
    throw ApiError.fromResponse(response, body)
  }

  return body as T
}

/**
 * Build URL with query parameters
 */
export function buildUrl(baseUrl: string, path: string, params?: Record<string, string | number | undefined>): string {
  const url = new URL(path, baseUrl)

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
