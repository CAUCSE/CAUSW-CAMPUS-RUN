import { z } from 'zod'

const studentNumberPattern = /^\d{8}(\d{2})?$/
const phonePattern = /^010\d{8}$/
const emailPattern = /^[^@\s]+@[^@\s]+$/

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function normalizePhone(value: string): string {
  return value.replace(/[\s-]/g, '')
}

const normalizedStudentNumberSchema = z.string()
  .transform((value) => value.replace(/\s/g, ''))
  .pipe(z.string().regex(studentNumberPattern, 'Invalid student number'))

const nicknameSchema = z.string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(12))

const normalizedEmailSchema = z.string()
  .transform(normalizeEmail)
  .pipe(z.string().max(254).regex(emailPattern, 'Invalid email address'))

const normalizedPhoneSchema = z.string()
  .transform(normalizePhone)
  .pipe(z.string().regex(phonePattern, 'Invalid Korean mobile phone number'))

export const CreateSessionInputSchema = z.object({
  studentNumber: normalizedStudentNumberSchema,
  nickname: nicknameSchema,
  email: normalizedEmailSchema,
  phoneNumber: normalizedPhoneSchema,
  privacyConsent: z.literal(true),
  thirdPartyConsent: z.literal(true),
}).strict()

export const CompleteSessionInputSchema = z.object({
  reportedElapsedMilliseconds: z.number().int().min(0).max(600_000),
  typoCount: z.number().int().min(0),
}).strict()
