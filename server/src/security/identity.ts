import { createHmac } from 'node:crypto'

export function studentHash(studentNumber: string, key: string): string {
  const normalizedStudentNumber = studentNumber.replace(/\D/g, '')
  return createHmac('sha256', key)
    .update(`student:${normalizedStudentNumber}`)
    .digest('hex')
}

export function dailyIpHash(ip: string, nowMs: number, key: string): string {
  const utcDate = new Date(nowMs).toISOString().slice(0, 10)
  return createHmac('sha256', key)
    .update(`ip:${utcDate}:${ip}`)
    .digest('hex')
}
