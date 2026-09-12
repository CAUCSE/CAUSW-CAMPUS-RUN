import { z } from 'zod'

export interface ServerConfig {
  readonly host: string
  readonly port: number
  readonly databasePath: string
  readonly allowedOrigins: readonly string[]
  readonly studentHmacKey: string
  readonly emailEncryptionKey: Buffer
  readonly adminEmail: string
  readonly adminPassword: string
  readonly trustProxy: number
}

const integerString = (name: string) => z.string()
  .regex(/^\d+$/, `${name} must be a non-negative integer`)

const portSchema = integerString('PORT')
  .default('3001')
  .transform(Number)
  .pipe(z.number().int().min(0).max(65_535))

const trustProxySchema = integerString('TRUST_PROXY')
  .default('0')
  .transform(Number)
  .pipe(z.number().int().min(0))

const secretSchema = (name: string) => z.string()
  .refine((value) => Buffer.byteLength(value, 'utf8') >= 32, {
    message: `${name} must contain at least 32 UTF-8 bytes`,
  })

const emailEncryptionKeySchema = z.string()
  .refine((value) => {
    const decoded = Buffer.from(value, 'base64')
    return decoded.length === 32 && decoded.toString('base64') === value
  }, {
    message: 'EMAIL_ENCRYPTION_KEY must be base64 for exactly 32 decoded bytes',
  })
  .transform((value) => Buffer.from(value, 'base64'))

function isExactHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value
  } catch {
    return false
  }
}

const configSchema = z.object({
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: portSchema,
  DATABASE_PATH: z.string().trim().min(1).default('data/cau-typing.sqlite'),
  ALLOWED_ORIGINS: z.string()
    .trim()
    .min(1)
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .refine((origins) => origins.every(isExactHttpOrigin), {
      message: 'ALLOWED_ORIGINS entries must be exact HTTP(S) origins',
    }),
  STUDENT_NUMBER_HMAC_KEY: secretSchema('STUDENT_NUMBER_HMAC_KEY'),
  EMAIL_ENCRYPTION_KEY: emailEncryptionKeySchema,
  ADMIN_EMAIL: z.email('ADMIN_EMAIL must be a valid email address'),
  ADMIN_PASSWORD: secretSchema('ADMIN_PASSWORD'),
  TRUST_PROXY: trustProxySchema,
})

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const value = configSchema.parse(env)

  return {
    host: value.HOST,
    port: value.PORT,
    databasePath: value.DATABASE_PATH,
    allowedOrigins: value.ALLOWED_ORIGINS,
    studentHmacKey: value.STUDENT_NUMBER_HMAC_KEY,
    emailEncryptionKey: value.EMAIL_ENCRYPTION_KEY,
    adminEmail: value.ADMIN_EMAIL,
    adminPassword: value.ADMIN_PASSWORD,
    trustProxy: value.TRUST_PROXY,
  }
}
