import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AdminPage } from './AdminPage'

const email = 'admin@example.com'
const password = 'admin-password-with-at-least-32-bytes!'
const authorization = `Basic ${btoa(`${email}:${password}`)}`

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('administrator page', () => {
  test('keeps credentials in memory and reveals controls after successful authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'SUCCESS',
      message: 'ok',
      data: { authenticated: true },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')

    render(<AdminPage />)
    await userEvent.type(screen.getByLabelText('관리자 이메일'), email)
    await userEvent.type(screen.getByLabelText('비밀번호'), password)
    await userEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('button', { name: 'CSV 다운로드' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v2/admin/campus-typing/auth'), {
      method: 'GET',
      headers: { Authorization: authorization },
    })
    expect(storageSpy).not.toHaveBeenCalled()
  })

  test('shows an error and keeps the login form when authentication fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'TYPING_ADMIN_UNAUTHORIZED',
      message: 'Administrator authentication is required.',
      data: null,
    }), { status: 401, headers: { 'content-type': 'application/json' } })))

    render(<AdminPage />)
    await userEvent.type(screen.getByLabelText('관리자 이메일'), email)
    await userEvent.type(screen.getByLabelText('비밀번호'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('이메일 또는 비밀번호를 확인해 주세요.')
    expect(screen.queryByRole('button', { name: 'CSV 다운로드' })).not.toBeInTheDocument()
  })

  test('requires the exact confirmation before deleting and reports deleted counts', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'SUCCESS', message: 'ok', data: { authenticated: true } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 'SUCCESS',
        message: 'ok',
        data: { sessionsDeleted: 3, recordsDeleted: 2 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AdminPage />)
    await userEvent.type(screen.getByLabelText('관리자 이메일'), email)
    await userEvent.type(screen.getByLabelText('비밀번호'), password)
    await userEvent.click(screen.getByRole('button', { name: '로그인' }))

    const deleteButton = await screen.findByRole('button', { name: '전체 초기화' })
    expect(deleteButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('초기화 확인 문구'), { target: { value: 'DELETE ALL CAMPUS TYPING DATA' } })
    expect(deleteButton).toBeEnabled()
    await userEvent.click(deleteButton)

    expect(await screen.findByRole('status')).toHaveTextContent('세션 3건과 기록 2건을 초기화했습니다.')
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('/api/v2/admin/campus-typing/records'), {
      method: 'DELETE',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE ALL CAMPUS TYPING DATA' }),
    })
  })

  test('downloads the protected CSV with the in-memory credentials', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'SUCCESS', message: 'ok', data: { authenticated: true } }), { status: 200 }))
      .mockResolvedValueOnce(new Response('rank,nickname\r\n1,winner\r\n', { status: 200, headers: { 'content-type': 'text/csv' } }))
    vi.stubGlobal('fetch', fetchMock)
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:records')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    render(<AdminPage />)
    await userEvent.type(screen.getByLabelText('관리자 이메일'), email)
    await userEvent.type(screen.getByLabelText('비밀번호'), password)
    await userEvent.click(screen.getByRole('button', { name: '로그인' }))
    await userEvent.click(await screen.findByRole('button', { name: 'CSV 다운로드' }))

    await waitFor(() => expect(click).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('/api/v2/admin/campus-typing/records.csv'), {
      method: 'GET',
      headers: { Authorization: authorization },
    })
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(createObjectURL.mock.calls[0]?.[0]).toMatchObject({ size: 25, type: 'text/csv' })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:records')
  })
})
