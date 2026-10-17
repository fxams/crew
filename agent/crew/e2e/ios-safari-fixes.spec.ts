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
              { label: 'Engagement', value: 40 },
              { label: 'Reach', value: 82 },
            ],
            lookupOk: true,
            xVerified: true,
            seasonPoints: 2250,
            memberNumber: 20361,
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
    await expect(card.getByText('REACH SCORE', { exact: false })).toBeVisible()
    await expect(card.locator('.kol-influence-score')).toContainText('82')
  })
})
