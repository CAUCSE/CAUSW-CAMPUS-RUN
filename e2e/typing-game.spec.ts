import { expect, test, type Page } from '@playwright/test'

const COURSE = [
  '영신관', '파이퍼홀', '수림과학관', '학생회관', '본관', '전산정보관', '서라벌홀', '중앙도서관', '봅스트홀',
  '제2공학관', '창업보육관', '중앙문화예술관', '대학원', '법학관', '미디어공연영상관', '글로벌하우스', '블루미르홀', '100주년기념관',
]

const LEADERBOARD = [
  { rank: 1, nickname: '선배', officialElapsedMilliseconds: 12_340, typoCount: 0 },
  { rank: 3, nickname: '캠퍼스러너', officialElapsedMilliseconds: 23_450, typoCount: 1 },
]

test('starts a game, completes every place, and shows the saved result', async ({ page }) => {
  await installApiRoutes(page)

  await page.goto('/')
  await page.getByLabel('학번').fill('20241234')
  await page.getByLabel('별명').fill('캠퍼스러너')
  await page.getByRole('button', { name: '게임 시작' }).click()
  await expect(page).toHaveURL(/\/play\.html$/)

  const placeInput = page.getByLabel('장소 입력')
  for (const place of COURSE) {
    await typePlaceCharacterByCharacter(placeInput, place)
  }

  await expect(page).toHaveURL(/\/result\.html$/)
  await expect(page.getByRole('article').getByText('캠퍼스러너', { exact: true })).toBeVisible()
  await expect(page.getByLabel('현재 순위 3위')).toBeVisible()
})

test('keeps the player on the game page and offers a retry when completion returns 503', async ({ page }) => {
  await installApiRoutes(page, { completionStatus: 503 })

  await page.goto('/')
  await page.getByLabel('학번').fill('20241234')
  await page.getByLabel('별명').fill('재시도러너')
  await page.getByRole('button', { name: '게임 시작' }).click()
  await expect(page).toHaveURL(/\/play\.html$/)

  const placeInput = page.getByLabel('장소 입력')
  for (const place of COURSE) {
    await typePlaceCharacterByCharacter(placeInput, place)
  }

  await expect(page).toHaveURL(/\/play\.html$/)
  await expect(page.getByRole('alert')).toContainText('기록 저장에 실패했습니다')
  await expect(page.getByRole('button', { name: '다시 저장' })).toBeVisible()
})

async function installApiRoutes(page: Page, options: { completionStatus?: number } = {}) {
  await page.route('**/api/v2/campus-typing/leaderboard', async (route) => {
    assertNoStudentNumber(LEADERBOARD)
    await route.fulfill({ json: { data: { entries: LEADERBOARD } } })
  })

  await page.route('**/api/v2/campus-typing/sessions', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(await route.request().postDataJSON()).toEqual({ studentNumber: '20241234', nickname: expect.any(String) })
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

    assertNoStudentNumber(LEADERBOARD)
    await route.fulfill({
      json: {
        data: {
          recordId: 'record-e2e',
          nickname: '캠퍼스러너',
          officialElapsedMilliseconds: 23_450,
          typoCount: 0,
          rankingStatus: 'ELIGIBLE',
          rank: 3,
          leaderboard: LEADERBOARD,
        },
      },
    })
  })
}

function assertNoStudentNumber(value: unknown) {
  expect(JSON.stringify(value)).not.toContain('studentNumber')
}

async function typePlaceCharacterByCharacter(input: ReturnType<Page['getByLabel']>, place: string) {
  for (const character of place) {
    await input.evaluate((element, key) => {
      element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    }, character)
  }
}
