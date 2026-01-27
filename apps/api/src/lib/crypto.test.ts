import { describe, it, expect } from 'vitest'
import { encryptCredentials, decryptCredentials, generateEncryptionKey } from './crypto.js'

describe('crypto', () => {
  describe('encryptCredentials/decryptCredentials', () => {
    it('should encrypt and decrypt credentials', () => {
      const credentials = { clientId: 'test-id', clientSecret: 'test-secret' }
      const { encrypted, iv } = encryptCredentials(credentials)
      const decrypted = decryptCredentials(encrypted, iv)

      expect(decrypted).toEqual(credentials)
    })

    it('should produce different ciphertext for same credentials (IV is random)', () => {
      const credentials = { clientId: 'test-id', clientSecret: 'test-secret' }
      const { encrypted: encrypted1 } = encryptCredentials(credentials)
      const { encrypted: encrypted2 } = encryptCredentials(credentials)

      expect(encrypted1).not.toEqual(encrypted2)
    })

    it('should handle complex credential objects', () => {
      const credentials = {
        clientId: 'my-client-id',
        clientSecret: 'my-super-secret',
        accessToken: 'initial-token-123',
        username: 'user@example.com',
      }

      const { encrypted, iv } = encryptCredentials(credentials)
      const decrypted = decryptCredentials(encrypted, iv)

      expect(decrypted).toEqual(credentials)
    })

    it('should handle empty credentials', () => {
      const credentials = {}
      const { encrypted, iv } = encryptCredentials(credentials)
      const decrypted = decryptCredentials(encrypted, iv)

      expect(decrypted).toEqual(credentials)
    })

    it('should handle unicode characters', () => {
      const credentials = {
        clientId: 'Special chars: 日本語 émojis 🔐',
        clientSecret: 'パスワード',
      }
      const { encrypted, iv } = encryptCredentials(credentials)
      const decrypted = decryptCredentials(encrypted, iv)

      expect(decrypted).toEqual(credentials)
    })

    it('should throw on tampered ciphertext', () => {
      const credentials = { clientId: 'test', clientSecret: 'secret' }
      const { encrypted, iv } = encryptCredentials(credentials)

      // Tamper with the ciphertext
      const tampered = Buffer.concat([encrypted.slice(0, -4), Buffer.from('xxxx')])

      expect(() => decryptCredentials(tampered, iv)).toThrow()
    })

    it('should throw on invalid IV', () => {
      const credentials = { clientId: 'test', clientSecret: 'secret' }
      const { encrypted } = encryptCredentials(credentials)

      // Use wrong IV
      const wrongIv = Buffer.alloc(16, 0)

      expect(() => decryptCredentials(encrypted, wrongIv)).toThrow()
    })
  })

  describe('generateEncryptionKey', () => {
    it('should generate a 64-character hex key', () => {
      const key = generateEncryptionKey()

      expect(key).toHaveLength(64)
      expect(/^[a-f0-9]+$/i.test(key)).toBe(true)
    })

    it('should generate unique keys', () => {
      const key1 = generateEncryptionKey()
      const key2 = generateEncryptionKey()

      expect(key1).not.toBe(key2)
    })
  })
})
