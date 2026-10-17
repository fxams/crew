import { expect, test } from '@playwright/test'
import { mockKolRegisterApis, resetKolClientState } from './helpers/kol-api-mocks'

const VITALIK_CARD =
  'https://api.crewpay.dev/api/kol-program/card/VitalikButerin.png'

test.describe('iOS Safari regressions (WebKit)', () => {
  test.beforeEach(async ({ page }) => {
    await resetKolClientState(page)
    await mockKolRegisterApis(page)
    await page.route('**/api/coins*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ coins: [] }),
      }),
    )
    await page.route('**/api/agent*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
    )
  })

  test('/tasks does not show Safari JSON parse error', async ({ page }) => {
    await page.route('**/api/tasks', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, tasks: [] }),
      }),
    )
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.form-error')).toHaveCount(0)
    await expect(page.getByText('The string did not match the expected pattern.')).toHaveCount(0)
    await expect(page.getByText(/No open tasks yet/i)).toBeVisible()
  })

  test('/tasks handles HTML 404 without Safari pattern error', async ({ page }) => {
    await page.route('**/api/tasks', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'text/html',
        body: '<!DOCTYPE html><html><body>Not Found</body></html>',
      }),
    )
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('The string did not match the expected pattern.')).toHaveCount(0)
    await expect(page.locator('.form-error')).toContainText(/unavailable|Failed/i)
  })

  test('/kol/VitalikButerin influence card renders', async ({ page }) => {
    await page.route('**/api/kol-program/public/VitalikButerin', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          card: {
            handle: 'VitalikButerin',
            claimed: false,
            unclaimed: true,
            displayName: 'Vitalik',
            avatarUrl: null,
            reachScore: 82,
            tier: 'apex',
            rank: null,
            founderNumber: null,
            referralUrl: 'https://crewpay.dev/ref/VitalikButerin',
            cardUrl: VITALIK_CARD,
            profileUrl: 'https://crewpay.dev/kol/VitalikButerin',
            scoreBars: [
              { label: 'Engagement', value: null, hint: 'Needs recent public posts' },
              { label: 'Reach', value: 82 },
              { label: 'Followers', value: 61 },
              { label: 'Content quality', value: null },
              { label: 'Network', value: null },
              { label: 'Account age', value: 100 },
            ],
            lookupOk: true,
            xVerified: true,
            seasonPoints: 2250,
            memberNumber: 20361,
            notionalInfluenceValueUsd: 2357,
          },
        }),
      }),
    )
    await page.route('**/api/kol-program/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true }),
      }),
    )
    await page.route('**/api/kols/profile/VitalikButerin', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false }) }),
    )
    await page.goto('/kol/VitalikButerin', { waitUntil: 'domcontentloaded' })
    const card = page.getByTestId('kol-influence-card')
    await expect(card).toBeVisible()
    await expect(card.getByText('Notional influence value', { exact: false })).toBeVisible()
    await expect(card.locator('.kol-influence-notional')).toContainText('$')
    await expect(card.locator('.kol-influence-secondary-metrics')).toContainText('82')
    await expect(card.getByText('GLOBAL RANK')).toHaveCount(0)
    await expect(card.getByText('MEMBER —')).toHaveCount(0)
    await expect(card.getByText('Engagement')).toBeVisible()
    await expect(card.locator('.kol-influence-bar-val').first()).toHaveText('—')
    const box = await card.locator('.kol-influence-frame').boundingBox()
    expect(box?.height || 9999).toBeLessThanOrEqual(640)
  })

  test('/kol always shows leaderboard empty podium', async ({ page }) => {
    await page.goto('/kol', { waitUntil: 'domcontentloaded' })
    const board = page.getByTestId('kol-hub-leaderboard')
    await expect(board).toBeVisible()
    await expect(board.getByTestId('kol-leaderboard-empty')).toBeVisible()
    await expect(board.getByText('Be the first')).toHaveCount(3)
    await expect(board.getByTestId('kol-leaderboard-sign-in-x')).toBeVisible()
    await page.goto('/kol/leaderboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('kol-leaderboard-empty')).toBeVisible()
    await expect(page.getByText('Be the first')).toHaveCount(3)
  })
})
