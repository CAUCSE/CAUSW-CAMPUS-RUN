export type AdminCredentials = {
  email: string
  password: string
}

export type DeletedCounts = {
  sessionsDeleted: number
  recordsDeleted: number
}

export class AdminApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'AdminApiError'
  }
}

export async function verifyAdminCredentials(credentials: AdminCredentials): Promise<void> {
  await request('/api/v2/admin/campus-typing/auth', credentials, { method: 'GET' })
}

export async function downloadRecordsCsv(credentials: AdminCredentials): Promise<Blob> {
  const response = await request('/api/v2/admin/campus-typing/records.csv', credentials, { method: 'GET' })
  return response.blob()
}

export async function deleteAllRecords(credentials: AdminCredentials): Promise<DeletedCounts> {
  const response = await request('/api/v2/admin/campus-typing/records', credentials, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: 'DELETE ALL CAMPUS TYPING DATA' }),
  })
  const payload: unknown = await response.json()
  if (!isRecord(payload) || !isRecord(payload.data)
    || typeof payload.data.sessionsDeleted !== 'number'
    || typeof payload.data.recordsDeleted !== 'number') {
    throw new AdminApiError('서버 응답을 처리하지 못했습니다.', response.status)
  }
  return {
    sessionsDeleted: payload.data.sessionsDeleted,
    recordsDeleted: payload.data.recordsDeleted,
  }
}

async function request(path: string, credentials: AdminCredentials, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: basicAuthorization(credentials),
        ...init.headers,
      },
    })
  } catch {
    throw new AdminApiError('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', 0)
  }
  if (!response.ok) {
    throw new AdminApiError(
      response.status === 401
        ? '이메일 또는 비밀번호를 확인해 주세요.'
        : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      response.status,
    )
  }
  return response
}

function basicAuthorization({ email, password }: AdminCredentials): string {
  const bytes = new TextEncoder().encode(`${email}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

function apiBaseUrl(): string {
  return (import.meta.env.VITE_TYPING_GAME_API_BASE_URL ?? '').replace(/\/+$/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
