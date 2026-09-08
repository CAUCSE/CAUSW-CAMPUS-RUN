import { ZodError } from 'zod'
import { RepositoryError } from '../database/repositories.js'

export interface ErrorEnvelope {
  readonly code: string
  readonly message: string
  readonly data: null
}

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function toErrorEnvelope(error: unknown): { statusCode: number; body: ErrorEnvelope } {
  if (error instanceof HttpError) {
    return {
      statusCode: error.statusCode,
      body: { code: error.code, message: error.message, data: null },
    }
  }

  if (error instanceof RepositoryError) {
    const mapped = {
      SESSION_NOT_FOUND: [404, 'TYPING_SESSION_NOT_FOUND', 'The game session was not found.'],
      SESSION_EXPIRED: [410, 'TYPING_SESSION_EXPIRED', 'The game session has expired.'],
      SESSION_COMPLETED: [409, 'TYPING_SESSION_COMPLETED', 'The game session has already been completed.'],
      INVALID_DURATION: [422, 'TYPING_INVALID_DURATION', 'The official duration is outside the allowed range.'],
    } as const
    const [statusCode, code, message] = mapped[error.kind]
    return { statusCode, body: { code, message, data: null } }
  }

  if (error instanceof ZodError || isFastifyInputError(error)) {
    return invalidInput()
  }

  return {
    statusCode: 500,
    body: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred.',
      data: null,
    },
  }
}

export function invalidInput(): { statusCode: number; body: ErrorEnvelope } {
  return {
    statusCode: 400,
    body: {
      code: 'TYPING_INVALID_INPUT',
      message: 'The request input is invalid.',
      data: null,
    },
  }
}

function isFastifyInputError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; statusCode?: unknown; validation?: unknown }
  return Boolean(
    candidate.validation
    || candidate.statusCode === 400
    || candidate.code === 'FST_ERR_CTP_BODY_TOO_LARGE'
    || candidate.code === 'FST_ERR_CTP_INVALID_JSON_BODY',
  )
}
