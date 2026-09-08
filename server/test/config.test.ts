import { expect, test } from 'vitest'

const validEnv = {
  PORT: '3001',
  HOST: '127.0.0.1',
  DATABASE_PATH: '/tmp/cau-typing.sqlite',
  ALLOWED_ORIGINS: 'https://typing.example, https://admin.example',
  STUDENT_NUMBER_HMAC_KEY: 'student-hmac-key-with-at-least-32-bytes',
  EMAIL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  ADMIN_TOKEN: 'admin-token-with-at-least-32-bytes!',
  TRUST_PROXY: '0',
}

test('loads validated server configuration', async () => {
  const { loadConfig } = await import('../src/config.js')

  expect(loadConfig(validEnv)).toMatchObject({
    host: '127.0.0.1',
    port: 3001,
    trustProxy: 0,
    databasePath: '/tmp/cau-typing.sqlite',
    allowedOrigins: ['https://typing.example', 'https://admin.example'],
  })
})

test('rejects an encryption key that is not 32 decoded bytes', async () => {
  const { loadConfig } = await import('../src/config.js')

  expect(() => loadConfig({
    ...validEnv,
    EMAIL_ENCRYPTION_KEY: Buffer.from('short').toString('base64'),
  })).toThrow('EMAIL_ENCRYPTION_KEY')
})

test('rejects HMAC and administrator secrets shorter than 32 UTF-8 bytes', async () => {
  const { loadConfig } = await import('../src/config.js')

  expect(() => loadConfig({ ...validEnv, STUDENT_NUMBER_HMAC_KEY: 'too-short' }))
    .toThrow('STUDENT_NUMBER_HMAC_KEY')
  expect(() => loadConfig({ ...validEnv, ADMIN_TOKEN: 'too-short' }))
    .toThrow('ADMIN_TOKEN')
})
