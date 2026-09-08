import { expect, test, type Page } from '@playwright/test'

const COURSE = [
  '영신관', '파이퍼홀', '수림과학관', '학생회관', '본관', '전산정보관', '서라벌홀', '중앙도서관', '봅스트홀',
  '제2공학관', '창업보육관', '중앙문화예술관', '대학원', '법학관', '미디어공연영상관', '글로벌하우스', '블루미르홀', '100주년기념관',
]

const LEADERBOARD = [
  { rank: 1, nickname: '선배', officialElapsedMilliseconds: 12_340, typoCount: 0 },
  { rank: 3, nickname: '캠퍼스러너', officialElapsedMilliseconds: 23_450, typoCount: 1 },
]

const TOP_TEN = Array.from({ length: 10 }, (_, index) => ({
  rank: index + 1,
  nickname: `러너${index + 1}`,
  officialElapsedMilliseconds: 12_340 + index * 100,
  typoCount: index % 3,
}))

test('accepts an Enter-submitted Korean attempt after countdown', async ({ page }) => {
  await installApiRoutes(page)

  await page.goto('/')
  await startGame(page, '조합러너')

  const placeInput = page.getByLabel('장소 입력')
  await waitForStart(page)
  await submitPlace(placeInput, '영신관')

  await expect(page.getByText('2 / 18')).toBeVisible()
  await expect(placeInput).toHaveValue('')
})

test('fits the lobby form and all ten leaderboard rows in a 1280x720 viewport', async ({ page }) => {
  await installApiRoutes(page, { leaderboard: TOP_TEN })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')

  await expect(page.getByRole('row', { name: /10.*러너10/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(720)
})

test('starts a game, completes every place, and shows the saved result', async ({ page }) => {
  await installApiRoutes(page)

  await page.goto('/')
  await startGame(page, '캠퍼스러너')
  await expect(page).toHaveURL(/\/play\.html$/)

  const placeInput = page.getByLabel('장소 입력')
  await waitForStart(page)
  for (const place of COURSE) {
    await submitPlace(placeInput, place)
  }

  await expect(page).toHaveURL(/\/result\.html$/)
  await expect(page.getByRole('article').getByText('캠퍼스러너', { exact: true })).toBeVisible()
  await expect(page.getByLabel('현재 순위 3위')).toBeVisible()
})

test('keeps the player on the game page and offers a retry when completion returns 503', async ({ page }) => {
  await installApiRoutes(page, { completionStatus: 503 })

  await page.goto('/')
  await startGame(page, '재시도러너')
  await expect(page).toHaveURL(/\/play\.html$/)

  const placeInput = page.getByLabel('장소 입력')
  await waitForStart(page)
  for (const place of COURSE) {
    await submitPlace(placeInput, place)
  }

  await expect(page).toHaveURL(/\/play\.html$/)
  await expect(page.getByRole('alert')).toContainText('기록 저장에 실패했습니다')
  await expect(page.getByRole('button', { name: '다시 저장' })).toBeVisible()
})

async function installApiRoutes(page: Page, options: { completionStatus?: number; leaderboard?: typeof LEADERBOARD } = {}) {
  const leaderboard = options.leaderboard ?? LEADERBOARD
  await page.route('**/api/v2/campus-typing/leaderboard', async (route) => {
    assertNoStudentNumber(leaderboard)
    await route.fulfill({ json: { data: { entries: leaderboard } } })
  })

  await page.route('**/api/v2/campus-typing/sessions', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(await route.request().postDataJSON()).toEqual({
      studentNumber: '20241234',
      nickname: expect.any(String),
      email: 'winner@example.com',
      phoneNumber: '01012345678',
      privacyConsent: true,
      thirdPartyConsent: true,
    })
    await route.fulfill({
      json: {
        data: {
          sessionId: 'session-e2e',
          course: COURSE,
          startedAt: new Date(Date.now()).toISOString(),
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        },
      },
    })
  })

  await page.route('**/api/v2/campus-typing/sessions/session-e2e/completion', async (route) => {
    expect(route.request().method()).toBe('POST')
    if (options.completionStatus === 503) {
      await route.fulfill({ status: 503, json: { message: '기록 저장 서버가 일시적으로 응답하지 않습니다.' } })
      return
    }

    assertNoStudentNumber(leaderboard)
    await route.fulfill({
      json: {
        data: {
          recordId: 'record-e2e',
          nickname: '캠퍼스러너',
          officialElapsedMilliseconds: 23_450,
          typoCount: 0,
          rankingStatus: 'ELIGIBLE',
          rank: 3,
          leaderboard,
        },
      },
    })
  })
}

function assertNoStudentNumber(value: unknown) {
  expect(JSON.stringify(value)).not.toContain('studentNumber')
}

async function startGame(page: Page, nickname: string) {
  await page.getByLabel('학번').fill('20241234')
  await page.getByLabel('별명').fill(nickname)
  await page.getByLabel('이메일').fill('winner@example.com')
  await page.getByLabel('휴대전화번호').fill('01012345678')
  await page.getByRole('checkbox', { name: '개인정보 수집·이용에 동의합니다. (필수)' }).check()
  await page.getByRole('checkbox', { name: '센드비를 통한 경품 발송을 위한 개인정보 제공에 동의합니다. (필수)' }).check()
  await page.getByRole('button', { name: '게임 시작' }).click()
}

async function waitForStart(page: Page) {
  await expect(page.getByLabel('장소 입력')).toBeEnabled({ timeout: 5_000 })
}

async function submitPlace(input: ReturnType<Page['getByLabel']>, place: string) {
  await input.fill(place)
  await input.press('Enter')
}
