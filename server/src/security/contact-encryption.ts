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

export function encryptContact(
  value: string,
  sessionId: string,
  field: ContactField,
  key: Buffer,
): EncryptedContact {
  assertEncryptionKey(key)

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
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

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'))
  decipher.setAAD(authenticatedData(sessionId, field))
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ])

  return plaintext.toString('utf8')
}
