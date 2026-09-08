import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export type ContactField = 'email' | 'phone'

export interface EncryptedContact {
  readonly ciphertext: string
  readonly iv: string
  readonly authTag: string
}

function authenticatedData(sessionId: string, field: ContactField): Buffer {
  return Buffer.from(`${sessionId}:${field}`)
}

function assertEncryptionKey(key: Buffer): void {
  if (key.length !== 32) {
    throw new Error('Invalid encryption key')
  }
}

function decodeEncryptionMetadata(value: string, expectedLength: number): Buffer {
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length !== expectedLength || decoded.toString('base64') !== value) {
    throw new Error('Invalid encrypted contact')
  }
  return decoded
}

export function encryptContact(
  value: string,
  sessionId: string,
  field: ContactField,
  key: Buffer,
): EncryptedContact {
  assertEncryptionKey(key)

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  cipher.setAAD(authenticatedData(sessionId, field))
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  }
}

export function decryptContact(
  encrypted: EncryptedContact,
  sessionId: string,
  field: ContactField,
  key: Buffer,
): string {
  assertEncryptionKey(key)

  const iv = decodeEncryptionMetadata(encrypted.iv, 12)
  const authTag = decodeEncryptionMetadata(encrypted.authTag, 16)
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  decipher.setAAD(authenticatedData(sessionId, field))
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ])

  return plaintext.toString('utf8')
}
