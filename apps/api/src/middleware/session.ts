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
 */
export const sessionMiddleware = createMiddleware(async (c, next) => {
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

  await next()
})

/**
 * Optional session middleware - attaches user if present but doesn't require it
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

  await next()
})
