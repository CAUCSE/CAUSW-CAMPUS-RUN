import { expect, test } from 'vitest'
import {
  CompleteSessionInputSchema,
  CreateSessionInputSchema,
  normalizeEmail,
  normalizePhone,
} from '../src/validation.js'
import {
  PRIVACY_CONSENT_VERSION,
  THIRD_PARTY_CONSENT_VERSION,
} from '../src/consent.js'

const validInput = {
  studentNumber: '20240001',
  nickname: '청룡',
  email: 'player@example.com',
  phoneNumber: '01012345678',
  privacyConsent: true,
  thirdPartyConsent: true,
}

test('normalizes email and phone contact values', () => {
  expect(normalizeEmail(' Player@Example.COM ')).toBe('player@example.com')
  expect(normalizePhone('010-1234 5678')).toBe('01012345678')
})

test('normalizes contact data and requires both explicit consents', () => {
  expect(CreateSessionInputSchema.safeParse(validInput).success).toBe(true)
  expect(CreateSessionInputSchema.parse({
    ...validInput,
    email: ' Player@Example.com ',
    phoneNumber: '010-1234-5678',
  })).toMatchObject({
    email: 'player@example.com',
    phoneNumber: '01012345678',
  })
  expect(CreateSessionInputSchema.safeParse({ ...validInput, privacyConsent: false }).success).toBe(false)
  expect(CreateSessionInputSchema.safeParse({ ...validInput, thirdPartyConsent: false }).success).toBe(false)
})

test('rejects malformed identity, contact, and completion audit values', () => {
  expect(CreateSessionInputSchema.parse({ ...validInput, studentNumber: '2024 0001' }).studentNumber).toBe('20240001')
  expect(CreateSessionInputSchema.safeParse({ ...validInput, nickname: '  ' }).success).toBe(false)
  expect(CreateSessionInputSchema.safeParse({ ...validInput, email: 'player@' }).success).toBe(false)
  expect(CreateSessionInputSchema.safeParse({ ...validInput, phoneNumber: '01112345678' }).success).toBe(false)
  expect(CompleteSessionInputSchema.safeParse({ reportedElapsedMilliseconds: 600_001, typoCount: 0 }).success).toBe(false)
  expect(CompleteSessionInputSchema.safeParse({ reportedElapsedMilliseconds: 10.5, typoCount: 0 }).success).toBe(false)
  expect(CompleteSessionInputSchema.safeParse({ reportedElapsedMilliseconds: 0, typoCount: -1 }).success).toBe(false)
})

test('exports server-owned consent versions', () => {
  expect(PRIVACY_CONSENT_VERSION).toBe('2026-09-08')
  expect(THIRD_PARTY_CONSENT_VERSION).toBe('2026-09-08')
})
