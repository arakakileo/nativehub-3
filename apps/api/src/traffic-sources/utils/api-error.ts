/**
 * Custom error class for traffic source API errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody?: unknown,
    public requestId?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }

  isRateLimit(): boolean {
    return this.statusCode === 429
  }

  isUnauthorized(): boolean {
    return this.statusCode === 401
  }

  isNotFound(): boolean {
    return this.statusCode === 404
  }

  isServerError(): boolean {
    return this.statusCode >= 500
  }

  /**
   * Check if this is a generic server error that may need support investigation
   */
  isGenericServerError(): boolean {
    if (this.statusCode !== 500) return false
    const body = this.responseBody as { message?: string } | undefined
    return body?.message?.includes('encountered an error') || false
  }

  static fromResponse(response: Response, body?: unknown, requestId?: string): ApiError {
    let message = `API Error: ${response.status} ${response.statusText}`

    if (body && typeof body === 'object' && 'message' in body) {
      message = String((body as { message: unknown }).message)
    } else if (body && typeof body === 'object' && 'error' in body) {
      message = String((body as { error: unknown }).error)
    }

    // Include requestId in message for easier debugging
    if (requestId) {
      message = `${message} (RequestID: ${requestId})`
    }

    return new ApiError(message, response.status, body, requestId)
  }
}
