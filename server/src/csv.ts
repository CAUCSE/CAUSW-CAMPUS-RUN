export interface WinnerRow {
  readonly rank: number
  readonly studentHash: string
  readonly nickname: string
  readonly email: string
  readonly phoneNumber: string
  readonly officialElapsedMilliseconds: number
  readonly typoCount: number
  readonly completedAt: string
  readonly privacyConsentVersion: string
  readonly thirdPartyConsentVersion: string
  readonly consentedAt: string
}

const CSV_HEADERS = [
  'rank',
  'studentHash',
  'nickname',
  'email',
  'phoneNumber',
  'officialElapsedMilliseconds',
  'typoCount',
  'completedAt',
  'privacyConsentVersion',
  'thirdPartyConsentVersion',
  'consentedAt',
] as const

export function escapeCsvCell(value: string | number): string {
  const stringValue = String(value)
  const formulaSafeValue = typeof value === 'string' && /^[=+\-@\t\r]/.test(stringValue)
    ? `'${stringValue}`
    : stringValue
  const escaped = formulaSafeValue.replaceAll('"', '""')

  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped
}

export function toWinnerCsv(rows: readonly WinnerRow[]): string {
  const values = rows.map((row) => [
    row.rank,
    row.studentHash,
    row.nickname,
    row.email,
    row.phoneNumber,
    row.officialElapsedMilliseconds,
    row.typoCount,
    row.completedAt,
    row.privacyConsentVersion,
    row.thirdPartyConsentVersion,
    row.consentedAt,
  ].map(escapeCsvCell).join(','))

  return `\uFEFF${[CSV_HEADERS.join(','), ...values].join('\r\n')}\r\n`
}
