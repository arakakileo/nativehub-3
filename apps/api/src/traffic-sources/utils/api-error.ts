/**
 * Custom error class for traffic source API errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody?: unknown
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

  static fromResponse(response: Response, body?: unknown): ApiError {
    let message = `API Error: ${response.status} ${response.statusText}`

    if (body && typeof body === 'object' && 'message' in body) {
      message = String((body as { message: unknown }).message)
    } else if (body && typeof body === 'object' && 'error' in body) {
      message = String((body as { error: unknown }).error)
    }

    return new ApiError(message, response.status, body)
  }
}
