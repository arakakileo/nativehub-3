# Authentication Implementation Guide - NativeHub 3.0

**Last Updated**: January 2, 2026
**Version**: 1.0
**Framework**: Better Auth v0.x + Hono + React

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Backend Implementation](#backend-implementation)
3. [Frontend Implementation](#frontend-implementation)
4. [Integration Points](#integration-points)
5. [Security Best Practices](#security-best-practices)
6. [Troubleshooting](#troubleshooting)
7. [Testing](#testing)

---

## Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  useAuthStore (Zustand)                                     │
│  ├── user: User | null                                      │
│  ├── isAuthenticated: boolean                               │
│  ├── login(email, password)                                 │
│  ├── signup(email, password, name)                          │
│  ├── logout()                                               │
│  └── checkSession()                                         │
│                                                               │
│  authClient (Better Auth)                                   │
│  ├── signIn.email()                                         │
│  ├── signUp.email()                                         │
│  ├── signOut()                                              │
│  └── getSession()                                           │
│                                                               │
└────────────┬──────────────────────────────────────────────┬──┘
             │ HTTP Requests                 │ HTTP-Only Cookies
             │                               │
┌────────────▼───────────────────────────────▼──────────────────┐
│                     Backend (Hono)                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Authentication Routes                                      │
│  └─ POST /api/auth/sign-in/email                           │
│  └─ POST /api/auth/sign-up/email                           │
│  └─ POST /api/auth/sign-out                                │
│  └─ GET /api/auth/get-session                              │
│                 │                                            │
│                 ▼                                            │
│  Better Auth Handler                                        │
│  ├── Validate credentials                                  │
│  ├── Hash passwords (bcrypt)                               │
│  ├── Create/manage sessions                                │
│  └── Set HTTP-only cookies                                 │
│                                                               │
│  Protected Routes (/api/v1/*)                              │
│  ├── sessionMiddleware                                      │
│  │   └── Extract & validate session from cookie           │
│  │   └── Set user context                                 │
│  │                                                         │
│  ├── apiRateLimiter                                        │
│  │   └── Check rate limit                                 │
│  │   └── Return 429 if exceeded                           │
│  │                                                         │
│  └── Route Handlers                                        │
│      └── Access userId from context                        │
│                                                               │
└────────────┬─────────────────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────────────────┐
│                   Database (PostgreSQL)                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  user table                          session table           │
│  ├── id (UUID)                       ├── id (UUID)          │
│  ├── email (unique)                  ├── userId (FK)        │
│  ├── name                            ├── expiresAt          │
│  ├── emailVerified                   ├── createdAt          │
│  ├── image                           └── updatedAt          │
│  ├── password (bcrypt hash)                                 │
│  ├── createdAt                                              │
│  └── updatedAt                                              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
1. USER SIGNUP
   ┌─────────────────────────────────────────────────────────┐
   │ User enters email, password, name in form               │
   └────────────┬────────────────────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ POST /api/auth/sign-up/email                            │
   │ Body: { email, password, name }                         │
   │ Rate Limit: 10/15min                                    │
   └────────────┬────────────────────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ Better Auth Handler                                     │
   │ 1. Validate email format                               │
   │ 2. Check email not already used                         │
   │ 3. Validate password (min 8 chars)                      │
   │ 4. Hash password with bcrypt                            │
   │ 5. Create user in database                              │
   │ 6. Create session                                       │
   │ 7. Set HTTP-only cookie                                 │
   └────────────┬────────────────────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ Response 201 Created                                    │
   │ Headers: Set-Cookie: nativehub_session=...             │
   │ Body: { user: {...}, session: {...} }                  │
   └────────────┬────────────────────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ Frontend receives response                              │
   │ 1. Browser automatically stores cookie                  │
   │ 2. Update auth store with user data                     │
   │ 3. Set isAuthenticated = true                           │
   │ 4. Redirect to dashboard                                │
   └─────────────────────────────────────────────────────────┘

2. USER LOGIN
   ┌─────────────────────────────────────────────────────────┐
   │ User enters email, password in form                     │
   └────────────┬────────────────────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ POST /api/auth/sign-in/email                            │
   │ Body: { email, password }                               │
   │ Rate Limit: 10/15min                                    │
   └────────────┬────────────────────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ Better Auth Handler                                     │
   │ 1. Find user by email                                   │
   │ 2. Compare password with bcrypt hash                    │
   │ 3. Return error if mismatch                             │
   │ 4. Create session if match                              │
   │ 5. Set HTTP-only cookie                                 │
   └────────────┬────────────────────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ Response 200 OK                                         │
   │ Headers: Set-Cookie: nativehub_session=...             │
   │ Body: { user: {...}, session: {...} }                  │
   └─────────────────────────────────────────────────────────┘

3. ACCESSING PROTECTED ROUTE
   ┌─────────────────────────────────────────────────────────┐
   │ GET /api/v1/campaigns                                   │
   │ Headers: (browser automatically includes cookies)      │
   │ Cookies: nativehub_session=...                          │
   └────────────┬────────────────────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ sessionMiddleware                                       │
   │ 1. Extract session from cookies                         │
   │ 2. Validate session exists and not expired              │
   │ 3. Call auth.api.getSession()                           │
   │ 4. Return 401 if invalid                                │
   │ 5. Set user context if valid                            │
   │ 6. Call next()                                          │
   └────────────┬────────────────────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ apiRateLimiter Middleware                               │
   │ 1. Extract IP from x-forwarded-for header               │
   │ 2. Check request count in window                        │
   │ 3. Return 429 if exceeded                               │
   │ 4. Increment counter                                    │
   │ 5. Call next()                                          │
   └────────────┬────────────────────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ Route Handler                                           │
   │ userId = c.get("userId")                               │
   │ 1. Fetch campaigns for userId                           │
   │ 2. Return data                                          │
   └─────────────────────────────────────────────────────────┘
```

---

## Backend Implementation

### 1. Better Auth Configuration

**File**: `apps/api/src/auth.ts`

```typescript
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "./lib/db.js"
import { trustedOrigins, isProduction, authConfig } from "./lib/config.js"

export const auth = betterAuth({
  // Database adapter - handles table management
  database: drizzleAdapter(db, { provider: "pg" }),

  // Secret for signing tokens (must be secure in production)
  secret: process.env.BETTER_AUTH_SECRET!,

  // Base URL for auth endpoints
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001",

  // Allowed origins for CORS/auth
  trustedOrigins,

  // Email/password authentication settings
  emailAndPassword: {
    enabled: true,
    minPasswordLength: authConfig.minPasswordLength,
  },

  // Session configuration
  session: {
    // How long until session expires
    expiresIn: 60 * 60 * 24 * authConfig.sessionExpiryDays,  // 7 days

    // How often to update session timestamp
    updateAge: 60 * 60 * 24 * authConfig.sessionUpdateDays,  // 24 hours

    // Cookie caching for performance
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,  // Cache for 5 minutes
    },
  },

  // Advanced security settings
  advanced: {
    // Cookie name prefix
    cookiePrefix: authConfig.cookiePrefix,  // "nativehub"

    // Use secure flag on cookies (HTTPS only in production)
    useSecureCookies: isProduction,
  },
})

// Export types for use in middleware and components
export type Session = typeof auth.$Infer.Session
export type User = Session["user"]
```

### 2. Configuration

**File**: `apps/api/src/lib/config.ts`

```typescript
// Trusted origins for CORS and authentication
export const trustedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[]

// Check if production environment
export const isProduction = process.env.NODE_ENV === "production"

// Auth configuration
export const authConfig = {
  sessionExpiryDays: 7,           // 7-day sessions
  sessionUpdateDays: 1,            // Update every 24 hours
  minPasswordLength: 8,            // Minimum password length
  cookiePrefix: "nativehub",       // Cookie name prefix
}

// Rate limiting configuration
export const rateLimitConfig = {
  auth: {
    windowMs: 15 * 60 * 1000,  // 15-minute window
    max: 10,                    // 10 requests per window
  },
  api: {
    windowMs: 60 * 1000,        // 1-minute window
    max: 100,                   // 100 requests per window
  },
}
```

### 3. Session Middleware

**File**: `apps/api/src/middleware/session.ts`

```typescript
import { createMiddleware } from "hono/factory"
import { auth, type User } from "../auth.js"

// Extend Hono context with user and session
declare module "hono" {
  interface ContextVariableMap {
    user: User
    userId: string
  }
}

/**
 * Session middleware - validates session and attaches user to context
 * Returns 401 if no valid session found
 *
 * Usage:
 *   app.use("/api/v1/*", sessionMiddleware)
 */
export const sessionMiddleware = createMiddleware(async (c, next) => {
  // Get session from request headers/cookies
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  // Validate session exists and has required user data
  if (!session?.user?.id) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  // Set user info in context for downstream handlers
  c.set("user", session.user)
  c.set("userId", session.user.id)

  // Continue to next middleware/handler
  await next()
})

/**
 * Optional session middleware - attaches user if present but doesn't require it
 *
 * Usage:
 *   app.use("/api/health/*", optionalSessionMiddleware)
 */
export const optionalSessionMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  // Only set user if session and user data are valid
  if (session?.user?.id) {
    c.set("user", session.user)
    c.set("userId", session.user.id)
  }

  // Always continue (no auth required)
  await next()
})
```

### 4. Rate Limiting Middleware

**File**: `apps/api/src/middleware/rate-limit.ts`

```typescript
import { createMiddleware } from "hono/factory"
import { rateLimitConfig } from "../lib/config.js"

// In-memory store for rate limit data
interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Periodic cleanup of expired entries (every minute)
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60000)

// Helper to create rate limit key from IP and prefix
function getRateLimitKey(ip: string, prefix: string): string {
  return `${prefix}:${ip}`
}

// Check if request is within rate limit
function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || entry.resetTime < now) {
    // First request in window or window expired
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    })
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs,
    }
  }

  // Check if exceeded
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    }
  }

  // Increment counter
  entry.count++
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetTime: entry.resetTime,
  }
}

/**
 * Rate limiting middleware for auth endpoints
 * Stricter limits to prevent brute force attacks
 * Limit: 10 requests per 15 minutes per IP
 */
export const authRateLimiter = createMiddleware(async (c, next) => {
  // Extract IP from request headers
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"

  // Check rate limit
  const key = getRateLimitKey(ip, "auth")
  const { allowed, remaining, resetTime } = checkRateLimit(
    key,
    rateLimitConfig.auth.windowMs,
    rateLimitConfig.auth.max
  )

  // Set rate limit headers
  c.header("X-RateLimit-Limit", String(rateLimitConfig.auth.max))
  c.header("X-RateLimit-Remaining", String(remaining))
  c.header("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)))

  // Return 429 if exceeded
  if (!allowed) {
    return c.json(
      {
        error: "Too many requests",
        message: "Please try again later",
        retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
      },
      429
    )
  }

  await next()
})

/**
 * Rate limiting middleware for general API endpoints
 * More permissive limits for regular API usage
 * Limit: 100 requests per 1 minute per IP
 */
export const apiRateLimiter = createMiddleware(async (c, next) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"

  const key = getRateLimitKey(ip, "api")
  const { allowed, remaining, resetTime } = checkRateLimit(
    key,
    rateLimitConfig.api.windowMs,
    rateLimitConfig.api.max
  )

  c.header("X-RateLimit-Limit", String(rateLimitConfig.api.max))
  c.header("X-RateLimit-Remaining", String(remaining))
  c.header("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)))

  if (!allowed) {
    return c.json(
      {
        error: "Too many requests",
        message: "Rate limit exceeded",
        retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
      },
      429
    )
  }

  await next()
})
```

### 5. Auth Routes

**File**: `apps/api/src/routes/auth.ts`

```typescript
import { Hono } from "hono"
import { auth } from "../auth.js"

/**
 * Better Auth handler - handles all authentication routes
 * Automatically handles: sign-in, sign-up, sign-out, get-session, etc.
 */
export const authRoutes = new Hono()
  // Match all HTTP methods on all paths under /auth/
  .on(["POST", "GET"], "/*", (c) => auth.handler(c.req.raw))
```

### 6. Integration in Main App

```typescript
import { Hono } from "hono"
import { cors } from "hono/cors"
import { authRoutes } from "./routes/auth.js"
import { campaignRoutes } from "./routes/campaigns.js"
import { sessionMiddleware, apiRateLimiter, authRateLimiter } from "./middleware/index.js"
import { trustedOrigins } from "./lib/config.js"

const app = new Hono()

// CORS configuration
app.use("*", cors({
  origin: trustedOrigins,
  credentials: true,
}))

// Health check (no auth required)
app.get("/health", (c) => c.json({ status: "ok" }))

// Auth routes (with rate limiting)
app.use("/api/auth/*", authRateLimiter)
app.route("/api/auth", authRoutes)

// Protected API routes
app.use("/api/v1/*", sessionMiddleware)
app.use("/api/v1/*", apiRateLimiter)
app.route("/api/v1/campaigns", campaignRoutes)
app.route("/api/v1/widgets", widgetRoutes)
// ... more routes

export default app
```

---

## Frontend Implementation

### 1. Auth Client Setup

**File**: `apps/web/src/lib/auth-client.ts`

```typescript
import { createAuthClient } from "better-auth/react"

// Get API URL from environment or fallback to localhost
const API_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ||
  "http://localhost:3001"

/**
 * Better Auth client for React
 * Handles session management and auth requests
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
})

// Export commonly used auth functions and hooks
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient
```

### 2. Auth Store (Zustand)

**File**: `apps/web/src/stores/authStore.ts`

```typescript
import { create } from 'zustand'
import { authClient } from '../lib/auth-client'

// Define user type
interface User {
  id: string
  email: string
  name?: string | null
  image?: string | null
}

// Define auth state and actions
interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name?: string) => Promise<void>
  logout: () => Promise<void>
  checkSession: () => Promise<void>
  clearError: () => void
}

/**
 * Auth store using Zustand
 * Manages user authentication state and provides actions
 */
export const useAuthStore = create<AuthState>()((set) => ({
  // Initial state
  user: null,
  isAuthenticated: false,
  isLoading: true,  // Start loading to check session on mount
  error: null,

  /**
   * Login with email and password
   */
  login: async (email, password) => {
    set({ isLoading: true, error: null })

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      })

      if (result.error) {
        throw new Error(result.error.message || 'Login failed')
      }

      set({
        user: result.data?.user as User,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed'
      set({
        error: message,
        isLoading: false,
      })
      throw error
    }
  },

  /**
   * Sign up with email, password, and optional name
   */
  signup: async (email, password, name) => {
    set({ isLoading: true, error: null })

    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name: name || email.split('@')[0],
      })

      if (result.error) {
        throw new Error(result.error.message || 'Signup failed')
      }

      set({
        user: result.data?.user as User,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signup failed'
      set({
        error: message,
        isLoading: false,
      })
      throw error
    }
  },

  /**
   * Logout - signs out and clears user state
   */
  logout: async () => {
    set({ isLoading: true })

    try {
      await authClient.signOut()
    } finally {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },

  /**
   * Check if user has valid session
   * Call on app mount to restore auth state
   */
  checkSession: async () => {
    set({ isLoading: true })

    try {
      const session = await authClient.getSession()

      if (session.data?.user) {
        set({
          user: session.data.user as User,
          isAuthenticated: true,
          isLoading: false,
        })
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        })
      }
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },

  /**
   * Clear error message
   */
  clearError: () => set({ error: null }),
}))
```

### 3. Login Component

**File**: `apps/web/src/pages/Login.tsx`

```typescript
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

export function Login() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading, login, signup, error, clearError } =
    useAuthStore()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Check if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard')
    }
  }, [isAuthenticated, navigate])

  // Show loading while checking session
  if (isLoading) {
    return <div>Loading...</div>
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setIsSubmitting(true)

    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await signup(email, password, name)
      }
      navigate('/dashboard')
    } catch {
      // Error is already set in store
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-form">
        <h1>{mode === 'login' ? 'Sign In' : 'Sign Up'}</h1>

        {error && (
          <div className="error-message">
            {error}
            <button onClick={clearError}>Dismiss</button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
            />
          </div>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Processing...'
              : mode === 'login'
                ? 'Sign In'
                : 'Sign Up'
            }
          </button>
        </form>

        <div className="auth-toggle">
          <p>
            {mode === 'login'
              ? "Don't have an account? "
              : 'Already have an account? '
            }
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login')
                clearError()
              }}
            >
              {mode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
```

### 4. Protected Route Component

```typescript
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />
  }

  return <>{children}</>
}
```

### 5. App Root Setup

```typescript
import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { ProtectedRoute } from '@/components/ProtectedRoute'

function App() {
  const checkSession = useAuthStore(s => s.checkSession)

  // Check session on app mount
  useEffect(() => {
    checkSession()
  }, [checkSession])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/dashboard" />} />
    </Routes>
  )
}

export default App
```

---

## Integration Points

### 1. Backend Route Protection

Wrap routes with session middleware:
```typescript
app.use("/api/v1/*", sessionMiddleware)

// All /api/v1/* routes now require valid session
app.get("/api/v1/campaigns", async (c) => {
  const userId = c.get("userId")  // Injected by middleware
  const user = c.get("user")      // Full user object

  // Fetch campaigns for this user
  const campaigns = await db.query.campaigns
    .findMany({ where: eq(campaignsTable.userId, userId) })

  return c.json({ data: campaigns })
})
```

### 2. Frontend API Calls

All API calls automatically include session cookie:
```typescript
// In a React component
function CampaignList() {
  const [campaigns, setCampaigns] = useState([])

  useEffect(() => {
    const fetchCampaigns = async () => {
      const response = await fetch('/api/v1/campaigns')
      // Cookie automatically included by browser
      // No need to manually set Authorization header

      if (!response.ok) {
        if (response.status === 401) {
          // Redirect to login
          navigate('/login')
        }
        throw new Error('Failed to fetch')
      }

      const { data } = await response.json()
      setCampaigns(data)
    }

    fetchCampaigns()
  }, [])

  return (
    <div>
      {campaigns.map(c => <div key={c.id}>{c.name}</div>)}
    </div>
  )
}
```

### 3. Service Layer Access to User Context

```typescript
export async function getCampaigns(c: Context) {
  const userId = c.get("userId")  // From middleware

  return await db.query.campaigns.findMany({
    where: eq(campaignsTable.userId, userId)
  })
}
```

---

## Security Best Practices

### 1. Password Security
```typescript
// DO: Validate password strength on frontend AND backend
const MIN_PASSWORD_LENGTH = 8
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/
// At least 1 lowercase, 1 uppercase, 1 digit

if (password.length < MIN_PASSWORD_LENGTH) {
  setError("Password must be at least 8 characters")
  return
}

// DON'T: Send password in plain text
// ALWAYS: HTTPS in production
```

### 2. Session Security
```typescript
// DO: Use HTTP-only cookies
// DON'T: Store session tokens in localStorage
// DO: Validate session on every protected request
// DO: Auto-logout on session expiration (7 days)
// DO: Auto-refresh session on activity (24-hour update)
```

### 3. Rate Limiting
```typescript
// DO: Implement tiered rate limits
// Auth endpoints: 10/15min (brute force protection)
// API endpoints: 100/min (fair usage)

// DON'T: Allow unlimited login attempts
// DO: Log failed auth attempts
// DO: Show user-friendly retry message
```

### 4. CORS & Origins
```typescript
// DO: Set trustedOrigins in auth config
// DON'T: Allow wildcard origins
// DO: Validate frontend domain in production

trustedOrigins = [
  "http://localhost:5173",           // Development
  "https://nativehub.arakakileo.com" // Production
]
```

### 5. Error Handling
```typescript
// DO: Return generic errors to client
return c.json({
  error: "Invalid credentials"  // Don't reveal if email exists
}, 401)

// DO: Log detailed errors server-side
logger.error({ email, attempt: 1 }, "Login failed - invalid password")

// DON'T: Return "User not found" (reveals email existence)
// DON'T: Expose stack traces to client
```

---

## Troubleshooting

### Common Issues

**1. "Unauthorized" on protected routes**
- Check session cookie is being set: Browser DevTools → Application → Cookies
- Verify BETTER_AUTH_URL is correct
- Ensure sessionMiddleware is applied before route handlers
- Check FRONTEND_URL matches frontend domain

**2. "Too many requests" (429)**
- Wait for rate limit window to reset
- Check X-RateLimit-Reset header for exact time
- Consider implementing retry logic with exponential backoff

**3. Login fails but no error**
- Check console for network errors
- Verify API URL in auth-client matches BETTER_AUTH_URL
- Check credentials aren't cached incorrectly

**4. Session expires unexpectedly**
- Sessions expire after 7 days (configurable)
- Check server time sync with client
- Verify BETTER_AUTH_SECRET is consistent across restarts

**5. Cookie not being set**
- Check HTTPS enforced in production (secure cookies)
- Verify credentials: true in CORS config
- Check SameSite cookie policy

### Debug Logging

Enable auth debug logging:
```typescript
// In auth.ts
export const auth = betterAuth({
  // ... config
  advanced: {
    // ... other config
    logger: {
      debug: (message) => console.log("[Auth Debug]", message),
      error: (message) => console.error("[Auth Error]", message),
    }
  }
})
```

---

## Testing

### Unit Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '@/stores/authStore'

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      error: null,
    })
  })

  it('should login with valid credentials', async () => {
    const { login } = useAuthStore.getState()

    await login('test@example.com', 'password123')

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.email).toBe('test@example.com')
  })

  it('should clear error on logout', async () => {
    const store = useAuthStore.getState()

    // Set error
    store.error = 'Test error'

    // Logout
    await store.logout()

    expect(store.error).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })
})
```

### Integration Tests

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import app from '@/app'

describe('Auth API', () => {
  describe('POST /api/auth/sign-up/email', () => {
    it('should create new user and return session', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@test.com',
          password: 'securepassword123',
          name: 'New User',
        }),
      })

      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.user.email).toBe('newuser@test.com')
      expect(res.headers.get('set-cookie')).toContain('nativehub_session')
    })

    it('should reject weak passwords', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@test.com',
          password: 'weak',  // Less than 8 chars
          name: 'User',
        }),
      })

      expect(res.status).toBe(400)
    })
  })

  describe('Rate Limiting', () => {
    it('should block after 10 login attempts in 15 minutes', async () => {
      // Send 11 login attempts
      for (let i = 0; i < 11; i++) {
        const res = await app.request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'test@test.com',
            password: 'wrongpassword',
          }),
        })

        if (i < 10) {
          expect(res.status).toBe(401)  // Invalid credentials
        } else {
          expect(res.status).toBe(429)  // Rate limited
        }
      }
    })
  })
})
```

---

## Environment Variables Checklist

**Development**:
```bash
BETTER_AUTH_SECRET=dev-secret-key-here
BETTER_AUTH_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5173
VITE_API_URL=http://localhost:3001
NODE_ENV=development
```

**Production**:
```bash
BETTER_AUTH_SECRET=<generate-with-openssl-rand-hex-32>
BETTER_AUTH_URL=https://api.nativehub.arakakileo.com
FRONTEND_URL=https://nativehub.arakakileo.com
VITE_API_URL=https://api.nativehub.arakakileo.com
NODE_ENV=production
```

---

## References

- [Better Auth Documentation](https://www.better-auth.com/)
- [Hono Documentation](https://hono.dev/)
- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
