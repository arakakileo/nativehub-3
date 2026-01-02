import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { logger } from './logger.js'

const ALGORITHM = 'aes-256-gcm'
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY environment variable not set')
  }
  if (keyHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  }
  return Buffer.from(keyHex, 'hex')
}

export interface EncryptedData {
  encrypted: Buffer
  iv: Buffer
}

export interface Credentials {
  clientId?: string
  clientSecret?: string
  username?: string
  password?: string
  accessToken?: string
  [key: string]: string | undefined
}

/**
 * Encrypt credentials object using AES-256-GCM
 */
export function encryptCredentials(credentials: Credentials): EncryptedData {
  const key = getEncryptionKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const jsonData = JSON.stringify(credentials)
  const encrypted = Buffer.concat([
    cipher.update(jsonData, 'utf8'),
    cipher.final(),
    cipher.getAuthTag()
  ])

  logger.debug('Credentials encrypted successfully')
  return { encrypted, iv }
}

/**
 * Decrypt credentials from AES-256-GCM encrypted buffer
 */
export function decryptCredentials(encrypted: Buffer, iv: Buffer): Credentials {
  const key = getEncryptionKey()

  // Extract auth tag (last 16 bytes)
  const authTag = encrypted.slice(-AUTH_TAG_LENGTH)
  const data = encrypted.slice(0, -AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final()
  ])

  return JSON.parse(decrypted.toString('utf8'))
}

/**
 * Generate a new random encryption key (for initial setup)
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex')
}
