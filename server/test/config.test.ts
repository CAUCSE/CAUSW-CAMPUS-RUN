import { expect, test } from 'vitest'

const validEnv = {
  PORT: '3001',
  HOST: '127.0.0.1',
  DATABASE_PATH: '/tmp/cau-typing.sqlite',
  ALLOWED_ORIGINS: 'http://localhost:5173, https://typing.example',
  STUDENT_NUMBER_HMAC_KEY: 'student-hmac-key-with-at-least-32-bytes',
  EMAIL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'admin-password-with-at-least-32-bytes!',
  TRUST_PROXY: '0',
}

test('loads validated server configuration', async () => {
  const { loadConfig } = await import('../src/config.js')

  expect(loadConfig(validEnv)).toMatchObject({
    host: '127.0.0.1',
    port: 3001,
    trustProxy: 0,
    databasePath: '/tmp/cau-typing.sqlite',
    allowedOrigins: ['http://localhost:5173', 'https://typing.example'],
  })
})

test('rejects an encryption key that is not 32 decoded bytes', async () => {
  const { loadConfig } = await import('../src/config.js')

  expect(() => loadConfig({
    ...validEnv,
    EMAIL_ENCRYPTION_KEY: Buffer.from('short').toString('base64'),
  })).toThrow('EMAIL_ENCRYPTION_KEY')
})

test('rejects HMAC and administrator passwords shorter than 32 UTF-8 bytes', async () => {
  const { loadConfig } = await import('../src/config.js')

  expect(() => loadConfig({ ...validEnv, STUDENT_NUMBER_HMAC_KEY: 'too-short' }))
    .toThrow('STUDENT_NUMBER_HMAC_KEY')
  expect(() => loadConfig({ ...validEnv, ADMIN_PASSWORD: 'too-short' }))
    .toThrow('ADMIN_PASSWORD')
})

test('rejects an invalid administrator email', async () => {
  const { loadConfig } = await import('../src/config.js')

  expect(() => loadConfig({ ...validEnv, ADMIN_EMAIL: 'not-an-email' }))
    .toThrow('ADMIN_EMAIL')
})

test.each([
  '*',
  'not-an-origin',
  'https://typing.example/path',
])('rejects a wildcard or non-Origin ALLOWED_ORIGINS value: %s', async (allowedOrigins) => {
  const { loadConfig } = await import('../src/config.js')

  expect(() => loadConfig({ ...validEnv, ALLOWED_ORIGINS: allowedOrigins }))
    .toThrow('ALLOWED_ORIGINS')
})
