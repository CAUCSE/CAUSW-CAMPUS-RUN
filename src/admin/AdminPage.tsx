import { useState, type FormEvent } from 'react'
import {
  AdminApiError,
  deleteAllRecords,
  downloadRecordsCsv,
  verifyAdminCredentials,
  type AdminCredentials,
} from './admin-api'
import styles from './AdminPage.module.css'

const DELETE_CONFIRMATION = 'DELETE ALL CAMPUS TYPING DATA'

export function AdminPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [credentials, setCredentials] = useState<AdminCredentials | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function login(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const nextCredentials = { email, password }
    try {
      await verifyAdminCredentials(nextCredentials)
      setCredentials(nextCredentials)
      setMessage('관리자 인증이 완료되었습니다.')
    } catch (caught) {
      setError(apiErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function downloadCsv() {
    if (!credentials) return
    setBusy(true)
    setError('')
    try {
      const blob = await downloadRecordsCsv(credentials)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'campus-typing-records.csv'
      anchor.click()
      URL.revokeObjectURL(url)
      setMessage('CSV 다운로드를 시작했습니다.')
    } catch (caught) {
      setError(apiErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function deleteRecords() {
    if (!credentials || confirmation !== DELETE_CONFIRMATION) return
    setBusy(true)
    setError('')
    try {
      const counts = await deleteAllRecords(credentials)
      setConfirmation('')
      setMessage(`세션 ${counts.sessionsDeleted}건과 기록 ${counts.recordsDeleted}건을 초기화했습니다.`)
    } catch (caught) {
      setError(apiErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>CAU TYPY</p>
        <h1>관리자</h1>
        {!credentials ? (
          <form className={styles.form} onSubmit={login}>
            <p className={styles.description}>기록을 내려받거나 초기화하려면 관리자 계정으로 로그인하세요.</p>
            <label>
              관리자 이메일
              <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              비밀번호
              <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <button type="submit" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
          </form>
        ) : (
          <div className={styles.actions}>
            <div className={styles.actionBox}>
              <h2>기록 내보내기</h2>
              <p>최고 기록과 참가자 연락처, 동의 정보를 CSV 파일로 내려받습니다.</p>
              <button type="button" disabled={busy} onClick={downloadCsv}>CSV 다운로드</button>
            </div>
            <div className={`${styles.actionBox} ${styles.dangerBox}`}>
              <h2>전체 초기화</h2>
              <p>모든 게임 세션과 기록이 영구 삭제됩니다. 실행 전 백업을 확인하세요.</p>
              <label>
                초기화 확인 문구
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={DELETE_CONFIRMATION} />
              </label>
              <button type="button" className={styles.dangerButton} disabled={busy || confirmation !== DELETE_CONFIRMATION} onClick={deleteRecords}>
                전체 초기화
              </button>
            </div>
            <button type="button" className={styles.secondary} onClick={() => {
              setCredentials(null)
              setPassword('')
              setConfirmation('')
              setMessage('')
              setError('')
            }}>로그아웃</button>
          </div>
        )}
        {message && <p role="status" className={styles.status}>{message}</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </section>
    </main>
  )
}

function apiErrorMessage(error: unknown): string {
  return error instanceof AdminApiError ? error.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}
