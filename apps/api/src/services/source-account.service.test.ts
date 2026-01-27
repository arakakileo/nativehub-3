import { describe, it, expect, beforeEach } from 'vitest'
import { sourceAccountService } from './source-account.service.js'
import { db } from '../lib/db.js'
import { sourceAccounts } from '../db/schema.js'
import { decryptCredentials } from '../lib/crypto.js'
import { eq } from 'drizzle-orm'
import { TEST_USER_ID, TEST_USER_ID_2 } from '../test/fixtures/index.js'

describe('SourceAccountService', () => {
  describe('create', () => {
    it('should create a source account with encrypted credentials', async () => {
      const result = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'My Revcontent Account',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      })

      expect(result).toBeDefined()
      expect(result.id).toBeDefined()
      expect(result.userId).toBe(TEST_USER_ID)
      expect(result.sourceId).toBe('revcontent')
      expect(result.name).toBe('My Revcontent Account')
      expect(result.status).toBe('pending')

      // Verify credentials are encrypted
      expect(result.credentialsEncrypted).toBeDefined()
      expect(result.credentialsIv).toBeDefined()

      // Verify we can decrypt
      const decrypted = decryptCredentials(result.credentialsEncrypted, result.credentialsIv)
      expect(decrypted.clientId).toBe('test-client-id')
      expect(decrypted.clientSecret).toBe('test-client-secret')
    })

    it('should store optional fields correctly', async () => {
      const result = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'taboola',
        name: 'Taboola Account',
        clientId: 'taboola-client',
        clientSecret: 'taboola-secret',
        accountId: 'ext-123',
        username: 'user@example.com',
        password: 'password123',
      })

      expect(result.externalAccountId).toBe('ext-123')

      // Verify username and password are in encrypted credentials
      const decrypted = decryptCredentials(result.credentialsEncrypted, result.credentialsIv)
      expect(decrypted.username).toBe('user@example.com')
      expect(decrypted.password).toBe('password123')
    })

    it('should generate unique ids for each account', async () => {
      const result1 = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'Account 1',
        clientId: 'id-1',
      })

      const result2 = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'Account 2',
        clientId: 'id-2',
      })

      expect(result1.id).not.toBe(result2.id)
    })
  })

  describe('list', () => {
    beforeEach(async () => {
      // Create test accounts
      await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'User1 Account',
        clientId: 'client-1',
      })
      await sourceAccountService.create(TEST_USER_ID_2, {
        sourceId: 'taboola',
        name: 'User2 Account',
        clientId: 'client-2',
      })
    })

    it('should return only accounts for specified user', async () => {
      const accounts = await sourceAccountService.list(TEST_USER_ID)

      expect(accounts).toHaveLength(1)
      expect(accounts[0].name).toBe('User1 Account')
      expect(accounts[0].userId).toBe(TEST_USER_ID)
    })

    it('should not include encrypted credentials in list', async () => {
      const accounts = await sourceAccountService.list(TEST_USER_ID)

      expect(accounts[0]).not.toHaveProperty('credentialsEncrypted')
      expect(accounts[0]).not.toHaveProperty('credentialsIv')
      expect(accounts[0]).not.toHaveProperty('accessToken')
      expect(accounts[0]).not.toHaveProperty('refreshToken')
    })

    it('should return empty array for user with no accounts', async () => {
      // Use a valid UUID that doesn't exist
      const accounts = await sourceAccountService.list('00000000-0000-0000-0000-000000000000')

      expect(accounts).toHaveLength(0)
    })
  })

  describe('get', () => {
    it('should return account for valid user and id', async () => {
      const created = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'Test Account',
        clientId: 'test-id',
      })

      const account = await sourceAccountService.get(TEST_USER_ID, created.id)

      expect(account).toBeDefined()
      expect(account!.id).toBe(created.id)
      expect(account!.name).toBe('Test Account')
    })

    it('should return null for wrong user', async () => {
      const created = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'Test Account',
        clientId: 'test-id',
      })

      const account = await sourceAccountService.get(TEST_USER_ID_2, created.id)

      expect(account).toBeNull()
    })

    it('should return null for non-existent id', async () => {
      const account = await sourceAccountService.get(TEST_USER_ID, '550e8400-e29b-41d4-a716-446655440099')

      expect(account).toBeNull()
    })
  })

  describe('getWithCredentials', () => {
    it('should return account with decrypted credentials', async () => {
      const created = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'Test Account',
        clientId: 'my-client-id',
        clientSecret: 'my-secret',
      })

      const result = await sourceAccountService.getWithCredentials(TEST_USER_ID, created.id)

      expect(result).toBeDefined()
      expect(result!.account.id).toBe(created.id)
      expect(result!.credentials.clientId).toBe('my-client-id')
      expect(result!.credentials.clientSecret).toBe('my-secret')
    })

    it('should return null for wrong user', async () => {
      const created = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'Test Account',
        clientId: 'test-id',
      })

      const result = await sourceAccountService.getWithCredentials(TEST_USER_ID_2, created.id)

      expect(result).toBeNull()
    })
  })

  describe('updateConnectionStatus', () => {
    it('should update status to connected with tokens', async () => {
      const created = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'Test Account',
        clientId: 'test-id',
      })

      const expiresAt = new Date(Date.now() + 3600000)
      await sourceAccountService.updateConnectionStatus(created.id, 'connected', {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        tokenExpiresAt: expiresAt,
      })

      // Verify update
      const [updated] = await db.select()
        .from(sourceAccounts)
        .where(eq(sourceAccounts.id, created.id))

      expect(updated.status).toBe('connected')
      expect(updated.accessToken).toBe('new-access-token')
      expect(updated.refreshToken).toBe('new-refresh-token')
      expect(updated.lastError).toBeNull()
    })

    it('should update status to error with error message', async () => {
      const created = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'Test Account',
        clientId: 'test-id',
      })

      await sourceAccountService.updateConnectionStatus(created.id, 'error', {
        error: 'Invalid credentials',
      })

      const [updated] = await db.select()
        .from(sourceAccounts)
        .where(eq(sourceAccounts.id, created.id))

      expect(updated.status).toBe('error')
      expect(updated.lastError).toBe('Invalid credentials')
    })

    it('should clear error when status changes to connected', async () => {
      const created = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'Test Account',
        clientId: 'test-id',
      })

      // First set error
      await sourceAccountService.updateConnectionStatus(created.id, 'error', {
        error: 'Some error',
      })

      // Then connect
      await sourceAccountService.updateConnectionStatus(created.id, 'connected', {
        accessToken: 'token',
      })

      const [updated] = await db.select()
        .from(sourceAccounts)
        .where(eq(sourceAccounts.id, created.id))

      expect(updated.status).toBe('connected')
      expect(updated.lastError).toBeNull()
    })
  })

  describe('updateSyncTime', () => {
    it('should update lastSyncAt timestamp', async () => {
      const created = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'Test Account',
        clientId: 'test-id',
      })

      const beforeSync = new Date()
      await sourceAccountService.updateSyncTime(created.id)
      const afterSync = new Date()

      const [updated] = await db.select()
        .from(sourceAccounts)
        .where(eq(sourceAccounts.id, created.id))

      expect(updated.lastSyncAt).toBeDefined()
      expect(updated.lastSyncAt!.getTime()).toBeGreaterThanOrEqual(beforeSync.getTime())
      expect(updated.lastSyncAt!.getTime()).toBeLessThanOrEqual(afterSync.getTime())
    })
  })

  describe('delete', () => {
    it('should delete account for valid user and id', async () => {
      const created = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'Test Account',
        clientId: 'test-id',
      })

      await sourceAccountService.delete(TEST_USER_ID, created.id)

      // Verify deleted
      const [found] = await db.select()
        .from(sourceAccounts)
        .where(eq(sourceAccounts.id, created.id))

      expect(found).toBeUndefined()
    })

    it('should throw 404 for wrong user', async () => {
      const created = await sourceAccountService.create(TEST_USER_ID, {
        sourceId: 'revcontent',
        name: 'Test Account',
        clientId: 'test-id',
      })

      await expect(sourceAccountService.delete(TEST_USER_ID_2, created.id))
        .rejects.toThrow('Source account not found')
    })

    it('should throw 404 for non-existent id', async () => {
      await expect(sourceAccountService.delete(TEST_USER_ID, '550e8400-e29b-41d4-a716-446655440099'))
        .rejects.toThrow('Source account not found')
    })
  })
})
