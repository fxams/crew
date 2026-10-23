import { expect, test } from '@playwright/test'
import { mockKolRegisterApis, resetKolClientState } from './helpers/kol-api-mocks'

async function mockCommonApis(page: import('@playwright/test').Page) {
  await mockKolRegisterApis(page)
  await page.route('**/api/kol-program/**', (route) => {
    const url = route.request().url()
    if (url.includes('/leaderboard')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          seasonId: 'season_2025_10',
          rows: [],
          disclaimer: 'Points have no cash value.',
          pool: null,
        }),
      })
    }
    if (url.includes('/hall-of-fame')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, seasons: [] }),
      })
    }
    if (url.includes('/seasons')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, seasons: [], archive: null, archiveSeasonId: null, hallOfFame: null }),
      })
    }
    if (url.includes('/status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, enabled: true }),
      })
    }
    if (url.includes('/onboarding') || url.includes('/tasks/today')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          signedIn: false,
          steps: [],
          tasks: [],
          pointsToday: 0,
          pointsCap: 5000,
          disclaimer: 'Points have no cash value.',
        }),
      })
    }
    return route.fulfill({ status: 404, body: '{}' })
  })
  await page.route('**/api/coins*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ coins: [] }) }),
  )
  await page.route('**/api/jobs**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, jobs: [] }) }),
  )
  await page.route('**/upstream-feed/v1/squads/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'pre-start',
        updated_at: new Date().toISOString(),
        refresh_seconds: 600,
        disclaimer:
          'Automated statistical analysis of public on-chain data. Indicates unusual trading patterns only, not proof of wrongdoing or an accusation against any person or squad. May contain errors.',
        methodology_url: 'upstream-feed
        dispute_contact: 'crewpay@mail.grokbot.com',
        competition: { name: 'Squad Invitiational' },
        squads: [],
        overlap: { shared_open_tokens: [], cotrade_pairs: [] },
        paper_copy: { paper_only: true, mode: 'paper', mainnet_available: false, kill_switch_engaged: true },
        copy_signals: [],
      }),
    }),
  )
  await page.route('**/api/agents/leaderboard*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        generatedAt: Date.now(),
        role: 'desk',
        shareBps: 1500,
        source: 'proof remits + launches',
        disclaimer: 'Creator fees follow trading volume and can be zero.',
        empty: true,
        emptyReason: 'No role=desk remits on the proof tape yet.',
        rows: [],
      }),
    }),
  )
}

const paths = ['/', '/agents', '/agents/earn', '/kol', '/kol/leaderboard', '/kol/tasks', '/kol/alerts', '/coins', '/jobs', '/squads', '/proof', '/register', '/ref/CrewPayHQ']

test.describe('SPA route smoke', () => {
  test.beforeEach(async ({ page }) => {
    await resetKolClientState(page)
    await mockCommonApis(page)
  })

  for (const path of paths) {
    test(`loads ${path} without crash`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('body')).not.toContainText('Something went wrong')
      expect(errors.filter((m) => !/ResizeObserver/i.test(m))).toEqual([])
    })
  }
})
