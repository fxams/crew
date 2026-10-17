import { test, expect } from '@playwright/test'
import { mockKolRegisterApis, resetKolClientState } from './helpers/kol-api-mocks'
import path from 'node:path'

const mockCard = {
  handle: 'VitalikButerin',
  claimed: false,
  unclaimed: true,
  displayName: 'Vitalik',
  avatarUrl: null,
  reachScore: 82,
  tier: 'apex',
  rank: 1110,
  founderNumber: null,
  referralUrl: 'https://crewpay.dev/ref/VitalikButerin',
  cardUrl: 'https://api.crewpay.dev/api/kol-program/card/VitalikButerin.png',
  profileUrl: 'https://crewpay.dev/kol/VitalikButerin',
  scoreBars: [
    { label: 'Engagement', value: 72 },
    { label: 'Reach', value: 82 },
    { label: 'Followers', value: 65 },
    { label: 'Content quality', value: 70 },
    { label: 'Network', value: 12 },
    { label: 'Account age', value: 88 },
  ],
  lookupOk: true,
  xVerified: true,
  followers: 5_000_000,
  seasonPoints: 2250,
  memberNumber: 20361,
  notionalInfluenceValueUsd: 2357,
}

test.describe('KOL influence UI screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await resetKolClientState(page)
    await mockKolRegisterApis(page, {
      registeredHandle: 'demoKol',
      deskProfile: {
        profile: {
          xUsername: 'demoKol',
          xName: 'Demo',
          wallet: '11111111111111111111111111111112',
          followers: 5000,
          rank: 42,
          registeredAt: new Date().toISOString(),
        },
        performance: { coinsHired: 0, coinsLaunched: 0, solReceived: 0, remitCount: 0, coins: [], remits: [] },
      },
    })
    await page.route('**/api/kol-program/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          profile: {
            xUserId: 'x1',
            handle: 'demoKol',
            reachScore: 82,
            tier: 'apex',
            founderNumber: null,
            seasonPoints: 2250,
            totalPoints: 2250,
            flaggedReason: null,
            revoked: false,
            referralCode: 'demoKol',
            referralUrl: 'https://crewpay.dev/ref/demoKol',
            rank: 42,
            referralCount: 1,
          },
        }),
      }),
    )
    await page.route('**/api/kol-program/public/demoKol', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, card: { ...mockCard, handle: 'demoKol', displayName: 'Demo' } }),
      }),
    )
    await page.route('**/api/kol-program/tasks/today', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          dayUtc: '2026-10-17',
          tasks: [
            {
              id: 't1',
              slug: 'theme',
              title: 'Post about today’s KOL theme',
              instructions: 'Quote-tweet with your card link.',
              points: 750,
              completed: false,
              locked: false,
            },
            {
              id: 't2',
              slug: 'verify',
              title: 'Verify a friend joined',
              instructions: 'Tag them in your post.',
              points: 250,
              completed: false,
              locked: true,
            },
          ],
          disclaimer: 'Points have no cash value.',
        }),
      }),
    )
    await page.route('**/api/coins*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ coins: [] }) }),
    )
    await page.route('**/api/agent*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
    )
  })

  test('mobile hub card + dashboard', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/kol', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('kol-influence-card')).toBeVisible({ timeout: 15_000 })
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect(page.getByTestId('kol-hub-dashboard')).toBeVisible()
    const out = path.join(testInfo.outputDir, 'kol-hub-mobile-influence.png')
    await page.screenshot({ path: out, fullPage: true })
  })

  test('mobile public kol card', async ({ page }, testInfo) => {
    await page.route('**/api/kol-program/public/VitalikButerin', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, card: mockCard }),
      }),
    )
    await page.route('**/api/kols/profile/VitalikButerin', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false }) }),
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/kol/VitalikButerin', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('kol-influence-card')).toBeVisible({ timeout: 15_000 })
    const out = path.join(testInfo.outputDir, 'kol-public-card-mobile-influence.png')
    await page.screenshot({ path: out, fullPage: true })
  })
})
