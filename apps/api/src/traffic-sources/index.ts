import type { TrafficSource, TrafficSourceCredentials, AuthResult } from './interface.js'
import { RevcontentSource } from './revcontent/index.js'
import { TaboolaSource } from './taboola/index.js'
import { OutbrainSource } from './outbrain/index.js'
import { MgidSource } from './mgid/index.js'
import { db } from '../lib/db.js'
import { sourceAccounts } from '../db/schema.js'
import { decryptCredentials } from '../lib/crypto.js'
import { eq } from 'drizzle-orm'
import { AppError } from '../middleware/error-handler.js'
import { logger } from '../lib/logger.js'

export { TrafficSource, TrafficSourceCredentials, AuthResult }
export { RevcontentSource, TaboolaSource, OutbrainSource, MgidSource }

// Traffic source registry
const sourceClasses: Record<string, new () => TrafficSource> = {
  revcontent: RevcontentSource,
  taboola: TaboolaSource,
  outbrain: OutbrainSource,
  mgid: MgidSource,
}

/**
 * Create a traffic source instance by ID
 */
export function createTrafficSource(sourceId: string): TrafficSource {
  const SourceClass = sourceClasses[sourceId]

  if (!SourceClass) {
    throw new Error(`Unknown traffic source: ${sourceId}`)
  }

  return new SourceClass()
}

// Cache authenticated instances
const instances = new Map<string, TrafficSource>()

/**
 * Get an authenticated traffic source instance for a source account
 */
export async function getAuthenticatedSource(sourceAccountId: string): Promise<TrafficSource> {
  // Check cache
  const cached = instances.get(sourceAccountId)
  if (cached?.isAuthenticated()) {
    return cached
  }

  // Load from DB
  const [account] = await db.select()
    .from(sourceAccounts)
    .where(eq(sourceAccounts.id, sourceAccountId))

  if (!account) {
    throw new AppError('Source account not found', 404)
  }

  // Create instance
  const source = createTrafficSource(account.sourceId)

  // Restore token if valid
  if (account.accessToken && account.tokenExpiresAt) {
    if (account.tokenExpiresAt > new Date()) {
      source.setStoredToken(account.accessToken, account.tokenExpiresAt)
      instances.set(sourceAccountId, source)
      return source
    }
  }

  // Need fresh auth
  const credentials = decryptCredentials(
    account.credentialsEncrypted,
    account.credentialsIv
  )

  logger.info({ sourceAccountId, sourceId: account.sourceId }, 'Authenticating source account')

  const result = await source.authenticate({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    username: credentials.username,
    password: credentials.password,
    accountId: account.externalAccountId || undefined,
  })

  // Update DB with new token
  await db.update(sourceAccounts)
    .set({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      tokenExpiresAt: new Date(Date.now() + result.expiresIn * 1000),
      status: 'connected',
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(sourceAccounts.id, sourceAccountId))

  instances.set(sourceAccountId, source)
  return source
}

/**
 * Clear cached instance (e.g., after credential update)
 */
export function clearCachedSource(sourceAccountId: string): void {
  instances.delete(sourceAccountId)
}
