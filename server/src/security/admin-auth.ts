import { createHash, timingSafeEqual } from 'node:crypto'

function digestToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

function bearerToken(authorization: string | string[] | undefined): string | null {
  if (typeof authorization !== 'string') return null

  const match = /^Bearer ([^\s]+)$/.exec(authorization)
  return match?.[1] ?? null
}

export function hasValidAdminBearerToken(
  authorization: string | string[] | undefined,
  configuredToken: string,
): boolean {
  const suppliedToken = bearerToken(authorization)
  if (suppliedToken === null) return false

  return timingSafeEqual(digestToken(suppliedToken), digestToken(configuredToken))
}
