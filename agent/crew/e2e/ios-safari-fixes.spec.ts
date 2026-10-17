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

  test('/kol/VitalikButerin card img uses PNG and loads', async ({ page }) => {
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
            scoreBars: [],
            lookupOk: true,
            xVerified: true,
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
    await page.route('**/api/kol-program/card/VitalikButerin.png', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'cross-origin-resource-policy': 'cross-origin' },
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64',
        ),
      }),
    )

    await page.goto('/kol/VitalikButerin', { waitUntil: 'domcontentloaded' })
    const img = page.getByTestId('kol-public-card').locator('img')
    await expect(img).toBeVisible()
    await expect(img).toHaveAttribute('src', /VitalikButerin\.png/)
    await expect
      .poll(async () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true)
  })
})
