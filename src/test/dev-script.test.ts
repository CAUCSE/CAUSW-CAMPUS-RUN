// @vitest-environment node
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { afterEach, expect, test } from 'vitest'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test('starts frontend and server together and stops the remaining process', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cau-typy-dev-script-'))
  temporaryDirectories.push(directory)
  const logPath = join(directory, 'calls.log')
  const fakeNpmPath = join(directory, 'npm')
  await writeFile(fakeNpmPath, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DEV_SCRIPT_TEST_LOG"
if [[ "$1" == "--prefix" ]]; then
  trap 'printf "server-stopped\\n" >> "$DEV_SCRIPT_TEST_LOG"; exit 0' TERM INT
  while true; do sleep 1; done
fi
exit 0
`)
  await chmod(fakeNpmPath, 0o755)

  const result = await run(resolve('scripts/dev.sh'), {
    DEV_NPM_BIN: fakeNpmPath,
    DEV_SCRIPT_TEST_LOG: logPath,
  })
  const calls = await readFile(logPath, 'utf8')

  expect(result.code).toBe(0)
  expect(calls).toContain('--prefix server run dev')
  expect(calls).toContain('run dev -- --host localhost --port 5173 --strictPort')
  expect(calls).toContain('server-stopped')
})

function run(scriptPath: string, environment: Record<string, string>): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn('bash', [scriptPath], {
      cwd: resolve('.'),
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => resolveRun({ code, stderr }))
  })
}
