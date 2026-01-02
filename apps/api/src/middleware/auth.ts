import type { Context, Next } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger.js'

// Supabase client for auth verification
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

let supabase: ReturnType<typeof createClient> | null = null

function getSupabase() {
  if (!supabase) {
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
    }
    supabase = createClient(supabaseUrl, supabaseServiceKey)
  }
  return supabase
}

// User type from Supabase
export interface AuthUser {
  id: string
  email?: string
  role?: string
}

// Extend Hono context with user
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser
  }
}

/**
 * Auth middleware - validates JWT token from Authorization header
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authorization header' }, 401)
  }

  const token = authHeader.slice(7)

  try {
    const sb = getSupabase()
    const { data: { user }, error } = await sb.auth.getUser(token)

    if (error || !user) {
      logger.warn({ error: error?.message }, 'Auth failed')
      return c.json({ error: 'Invalid token' }, 401)
    }

    c.set('user', {
      id: user.id,
      email: user.email,
      role: user.role,
    })

    await next()
  } catch (error) {
    logger.error({ error }, 'Auth middleware error')
    return c.json({ error: 'Authentication failed' }, 401)
  }
}
