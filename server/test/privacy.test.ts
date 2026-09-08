import { createHmac } from 'node:crypto'
import { expect, test } from 'vitest'
import { decryptContact, encryptContact } from '../src/security/contact-encryption.js'
import { dailyIpHash, studentHash } from '../src/security/identity.js'

const encryptionKey = Buffer.alloc(32, 7)

test('hashes digit-only student numbers with the student domain separator', () => {
  const hash = studentHash('2024 0001', 'student-secret')

  expect(hash).toBe(createHmac('sha256', 'student-secret').update('student:20240001').digest('hex'))
  expect(hash).not.toContain('20240001')
  expect(hash).toBe(studentHash('20240001', 'student-secret'))
  expect(hash).not.toBe(studentHash('20240001', 'different-secret'))
})

test('scopes nonreversible IP hashes to a UTC calendar day', () => {
  const firstMoment = Date.UTC(2026, 8, 8, 23, 59, 59)
  const nextDay = Date.UTC(2026, 8, 9, 0, 0, 0)
  const hash = dailyIpHash('203.0.113.5', firstMoment, 'ip-secret')

  expect(hash).toBe(createHmac('sha256', 'ip-secret').update('ip:2026-09-08:203.0.113.5').digest('hex'))
  expect(hash).not.toContain('203.0.113.5')
  expect(hash).not.toBe(dailyIpHash('203.0.113.5', nextDay, 'ip-secret'))
})

test('encrypts contacts with session and field-bound authenticated data', () => {
  const encrypted = encryptContact('01012345678', 'session-1', 'phone', encryptionKey)

  expect(encrypted.ciphertext).not.toContain('01012345678')
  expect(Buffer.from(encrypted.iv, 'base64')).toHaveLength(12)
  expect(Buffer.from(encrypted.authTag, 'base64')).toHaveLength(16)
  expect(decryptContact(encrypted, 'session-1', 'phone', encryptionKey)).toBe('01012345678')
  expect(() => decryptContact(encrypted, 'session-2', 'phone', encryptionKey)).toThrow()
  expect(() => decryptContact(encrypted, 'session-1', 'email', encryptionKey)).toThrow()
  expect(() => decryptContact(encrypted, 'session-1', 'phone', Buffer.alloc(32, 8))).toThrow()
})

test('rejects a contact whose authenticated tag was altered without echoing its value', () => {
  const encrypted = encryptContact('person@example.com', 'session-1', 'email', encryptionKey)
  const altered = {
    ...encrypted,
    authTag: Buffer.alloc(16, 9).toString('base64'),
  }

  expect(() => decryptContact(altered, 'session-1', 'email', encryptionKey))
    .toThrowError(/unable to authenticate data/i)
  expect(() => decryptContact(altered, 'session-1', 'email', encryptionKey))
    .not.toThrowError(/person@example\.com/)
})
