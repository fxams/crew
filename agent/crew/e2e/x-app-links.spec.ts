import { expect, test } from '@playwright/test'
import { mockKolRegisterApis, resetKolClientState } from './helpers/kol-api-mocks'

test.describe('X links open in-app on mobile', () => {
  test.beforeEach(async ({ page }) => {
    await resetKolClientState(page)
    await mockKolRegisterApis(page)
  })

  test('nav X icon uses XLink; mobile has no target=_blank', async ({ page }, info) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const x = page.getByRole('link', { name: 'X @CrewPayHQ' }).first()
    await expect(x).toBeVisible()
    await expect(x).toHaveAttribute('href', 'https://x.com/CrewPayHQ')
    await expect(x).toHaveAttribute('data-x-link', 'true')
    const mobile = info.project.name.startsWith('mobile')
    if (mobile) {
      await expect(x).not.toHaveAttribute('target', '_blank')
    } else {
      await expect(x).toHaveAttribute('target', '_blank')
    }
  })

  test('KOL card share is an x.com intent without a new-tab target on mobile', async ({ page }, info) => {
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
            scoreBars: [
              { label: 'Engagement', value: null },
              { label: 'Reach', value: 82 },
            ],
            lookupOk: true,
            seasonPoints: 0,
            notionalInfluenceValueUsd: 4061,
          },
        }),
      }),
    )
    await page.setViewportSize({ width: 390, height: 700 })
    await page.goto('/kol/VitalikButerin', { waitUntil: 'domcontentloaded' })
    const share = page.getByTestId('kol-card-share-x')
    await expect(share).toBeVisible({ timeout: 20000 })
    const href = await share.getAttribute('href')
    expect(href).toMatch(/https:\/\/x\.com\/intent\/post/)
    expect(href).toContain('CrewPay')
    await expect(share).toHaveAttribute('data-x-link', 'true')
    if (info.project.name.startsWith('mobile')) {
      await expect(share).not.toHaveAttribute('target', '_blank')
    }
  })
})
