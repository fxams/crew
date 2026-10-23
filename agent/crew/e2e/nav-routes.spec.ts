import { expect, test } from '@playwright/test'
import { mockKolRegisterApis, resetKolClientState } from './helpers/kol-api-mocks'

/** Mirrors `App.tsx` header nav (KOL program enabled build). */
const NAV_ROUTES = [
  '/',
  '/agents',
  '/agents/earn',
  '/kol',
  '/register',
  '/kol/leaderboard',
  '/kol/tasks',
  '/kol/alerts',
  '/ref/CrewPayHQ',
  '/kol/e2eKol',
  '/coins',
  '/jobs',
  '/squads',
  '/proof',
  '/launch',
]

async function mockDesk(page: import('@playwright/test').Page) {
  await mockKolRegisterApis(page, {
    deskProfile: {
      profile: {
        xUsername: 'e2eKol',
        xName: 'E2E',
        wallet: '11111111111111111111111111111112',
        followers: 1000,
        rank: 1,
        registeredAt: new Date().toISOString(),
      },
      performance: { coinsHired: 0, coinsLaunched: 0, solReceived: 0, remitCount: 0, coins: [], remits: [] },
    },
  })
  await page.route('**/api/coins*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ coins: [] }) }),
  )
  await page.route('**/api/agent*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  )
  await page.route('**/api/jobs**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, jobs: [] }) }),
  )
  await page.route('**/api/squads/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'pre-start',
        updated_at: new Date().toISOString(),
        refresh_seconds: 600,
        disclaimer:
          'Automated statistical analysis of public on-chain data. Indicates unusual trading patterns only, not proof of wrongdoing or an accusation against any person or squad. May contain errors.',
        competition: { name: 'Squad Invitiational' },
        squads: [],
        overlap: { shared_open_tokens: [], cotrade_pairs: [] },
        paper_copy: { paper_only: true, mode: 'paper', mainnet_available: false, kill_switch_engaged: true },
        copy_signals: [],
      }),
    }),
  )
}

test.describe('Header nav routes — no JS errors (mobile)', () => {
  test.beforeEach(async ({ page }) => {
    await resetKolClientState(page)
    await mockDesk(page)
  })

  for (const path of NAV_ROUTES) {
    test(`${path} loads without page errors`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (err) => pageErrors.push(err.message))
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('body')).not.toContainText('Something went wrong', { timeout: 15_000 })
      const benign = pageErrors.filter((m) => !/ResizeObserver|401|Failed to load resource/i.test(m))
      expect(benign, benign.join('\n')).toEqual([])
    })
  }
})
