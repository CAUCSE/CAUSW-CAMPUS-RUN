import { createHash, timingSafeEqual } from 'node:crypto'

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

function basicCredentials(authorization: string | string[] | undefined): { email: string; password: string } | null {
  if (typeof authorization !== 'string') return null

  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(authorization)
  if (!match) return null

  const encoded = match[1]
  const decoded = Buffer.from(encoded, 'base64')
  if (decoded.toString('base64') !== encoded) return null

  const value = decoded.toString('utf8')
  const separator = value.indexOf(':')
  if (separator < 1) return null
  return { email: value.slice(0, separator), password: value.slice(separator + 1) }
}

export function hasValidAdminBasicCredentials(
  authorization: string | string[] | undefined,
  configuredEmail: string,
  configuredPassword: string,
): boolean {
  const supplied = basicCredentials(authorization)
  if (supplied === null) return false

  const emailMatches = timingSafeEqual(digest(supplied.email), digest(configuredEmail))
  const passwordMatches = timingSafeEqual(digest(supplied.password), digest(configuredPassword))
  return emailMatches && passwordMatches
}
