// Centralized configuration for the API

// Trusted origins for CORS and authentication
export const trustedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[]

// Environment flags
export const isProduction = process.env.NODE_ENV === "production"

// Auth configuration
export const authConfig = {
  sessionExpiryDays: 7,
  sessionUpdateDays: 1,
  minPasswordLength: 8,
  cookiePrefix: "nativehub",
}

// Rate limiting configuration
export const rateLimitConfig = {
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per window for auth endpoints
  },
  api: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute for API endpoints
  },
}
