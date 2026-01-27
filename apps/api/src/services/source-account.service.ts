import { db } from '../lib/db.js'
import { sourceAccounts, type SourceAccount, type NewSourceAccount } from '../db/schema.js'
import { encryptCredentials, decryptCredentials, type Credentials } from '../lib/crypto.js'
import { eq, and } from 'drizzle-orm'
import { AppError } from '../middleware/error-handler.js'
import { logger } from '../lib/logger.js'

export interface CreateSourceAccountDTO {
  sourceId: 'revcontent' | 'taboola' | 'outbrain' | 'mgid'
  name: string
  clientId: string
  clientSecret?: string
  accountId?: string
  username?: string
  password?: string
}

class SourceAccountService {
  /**
   * Create a new source account with encrypted credentials
   */
  async create(userId: string, data: CreateSourceAccountDTO): Promise<SourceAccount> {
    logger.info({ userId, sourceId: data.sourceId }, 'Creating source account')

    // Encrypt credentials
    const credentials: Credentials = {
      clientId: data.clientId,
      clientSecret: data.clientSecret,
      username: data.username,
      password: data.password,
    }

    const { encrypted, iv } = encryptCredentials(credentials)

    const [account] = await db.insert(sourceAccounts).values({
      userId,
      sourceId: data.sourceId,
      name: data.name,
      credentialsEncrypted: encrypted,
      credentialsIv: iv,
      externalAccountId: data.accountId,
      status: 'pending',
    }).returning()

    logger.info({ accountId: account.id }, 'Source account created')
    return account
  }

  /**
   * List all source accounts for a user (without credentials)
   */
  async list(userId: string): Promise<Omit<SourceAccount, 'credentialsEncrypted' | 'credentialsIv' | 'accessToken' | 'refreshToken'>[]> {
    const accounts = await db.select({
      id: sourceAccounts.id,
      userId: sourceAccounts.userId,
      sourceId: sourceAccounts.sourceId,
      name: sourceAccounts.name,
      externalAccountId: sourceAccounts.externalAccountId,
      status: sourceAccounts.status,
      lastSyncAt: sourceAccounts.lastSyncAt,
      lastError: sourceAccounts.lastError,
      tokenExpiresAt: sourceAccounts.tokenExpiresAt,
      createdAt: sourceAccounts.createdAt,
      updatedAt: sourceAccounts.updatedAt,
    })
    .from(sourceAccounts)
    .where(eq(sourceAccounts.userId, userId))

    return accounts
  }

  /**
   * Get a single source account (without credentials)
   */
  async get(userId: string, accountId: string): Promise<SourceAccount | null> {
    const [account] = await db.select()
      .from(sourceAccounts)
      .where(and(
        eq(sourceAccounts.id, accountId),
        eq(sourceAccounts.userId, userId)
      ))

    return account || null
  }

  /**
   * Get account with decrypted credentials (internal use only)
   */
  async getWithCredentials(userId: string, accountId: string): Promise<{ account: SourceAccount; credentials: Credentials } | null> {
    const account = await this.get(userId, accountId)
    if (!account) return null

    const credentials = decryptCredentials(
      account.credentialsEncrypted,
      account.credentialsIv
    )

    return { account, credentials }
  }

  /**
   * Update account status after connection test
   */
  async updateConnectionStatus(
    accountId: string,
    status: 'connected' | 'error',
    options: {
      accessToken?: string
      refreshToken?: string
      tokenExpiresAt?: Date
      error?: string
    } = {}
  ): Promise<void> {
    await db.update(sourceAccounts)
      .set({
        status,
        accessToken: options.accessToken,
        refreshToken: options.refreshToken,
        tokenExpiresAt: options.tokenExpiresAt,
        lastError: options.error || null,
        updatedAt: new Date(),
      })
      .where(eq(sourceAccounts.id, accountId))

    logger.info({ accountId, status }, 'Account connection status updated')
  }

  /**
   * Update last sync timestamp
   */
  async updateSyncTime(accountId: string): Promise<void> {
    await db.update(sourceAccounts)
      .set({
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sourceAccounts.id, accountId))
  }

  /**
   * Delete a source account
   */
  async delete(userId: string, accountId: string): Promise<void> {
    const result = await db.delete(sourceAccounts)
      .where(and(
        eq(sourceAccounts.id, accountId),
        eq(sourceAccounts.userId, userId)
      ))
      .returning({ id: sourceAccounts.id })

    if (result.length === 0) {
      throw new AppError('Source account not found', 404)
    }

    logger.info({ accountId }, 'Source account deleted')
  }
}

export const sourceAccountService = new SourceAccountService()
