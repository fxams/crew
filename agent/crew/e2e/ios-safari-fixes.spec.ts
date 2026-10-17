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
    await page.setViewportSize({ width: 390, height: 700 })
    await page.goto('/kol', { waitUntil: 'domcontentloaded' })
    const board = page.getByTestId('kol-hub-leaderboard')
    await expect(board).toBeInViewport()
    await expect(board.getByTestId('kol-leaderboard-empty')).toBeInViewport()
    await expect(board.getByText('Be the first')).toHaveCount(3)
    await expect(board.getByTestId('kol-leaderboard-sign-in-x')).toBeInViewport()
    await expect(page.getByRole('navigation', { name: 'KOL area' }).getByText('Board')).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Launch Coin' })).toHaveCount(0)
    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/kol-hub-empty-board-390x700.png',
    })
    await page.getByTestId('kol-tab-board').click()
    await expect(page).toHaveURL(/\/kol\/leaderboard/)
    await expect(page.getByTestId('kol-leaderboard-empty')).toBeInViewport()
    await expect(page.getByText('Be the first')).toHaveCount(3)
    await expect(page.getByTestId('kol-leaderboard-sign-in-x')).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Launch Coin' })).toHaveCount(0)
    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/kol-leaderboard-empty-board-390x700.png',
    })
  })

  test('/kol shows real points board, joiner row, and Board tab', async ({ page }) => {
    const row = {
      rank: 1,
      handle: 'mubaraqabba',
      displayName: 'Mubarak Yakubu',
      avatarUrl: null,
      seasonPoints: 0,
      reachScore: 44,
      tier: 'silver',
      founderNumber: 1,
    }
    await page.route('**/api/kol-program/leaderboard*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          seasonId: 'season_test',
          rows: [row],
          disclaimer: 'Points have no cash value.',
          pool: null,
        }),
      }),
    )
    await page.route('**/api/kol-program/hub', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          seasonId: 'season_test',
          seasonEndsAt: new Date(Date.now() + 15 * 86400000).toISOString(),
          foundingSnapshotAt: new Date(Date.now() + 14 * 86400000).toISOString(),
          memberCount: 1,
          showMemberCount: false,
          rows: [row],
          recentJoiners: [
            {
              handle: 'mubaraqabba',
              displayName: 'Mubarak Yakubu',
              avatarUrl: null,
              enrolledAt: new Date().toISOString(),
              founderNumber: 1,
              reachScore: 44,
              tier: 'silver',
            },
          ],
          referralMilestones: [],
          disclaimer: 'Points have no cash value.',
        }),
      }),
    )
    await page.setViewportSize({ width: 390, height: 700 })
    await page.goto('/kol', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('kol-hub-leaderboard-link')).toBeInViewport()
    const board = page.getByTestId('kol-hub-leaderboard')
    await expect(board.getByTestId('kol-season-podium')).toBeInViewport()
    await expect(board.getByText('Be the first')).toHaveCount(2)
    await expect(board.getByTestId('kol-board-row').first()).toContainText('@mubaraqabba')
    await expect(board.getByTestId('kol-board-row').first()).toContainText('0 pts')
    await expect(board.getByTestId('kol-board-row').first()).toContainText('Reach 44')
    await expect(board.getByTestId('kol-board-row').first()).toContainText('Pulse')
    const stats = page.getByTestId('kol-hub-stats')
    await expect(stats).toBeVisible()
    await expect(stats.locator('.kol-hub-stat')).toHaveCount(3)
    await expect(stats).toContainText('Be one of the first')
    await expect(stats).toContainText('Season ending soon')
    const joiners = page.getByTestId('kol-hub-joiners')
    await expect(joiners.getByTestId('kol-board-row')).toContainText('Mubarak Yakubu')
    await expect(joiners.getByTestId('kol-board-row')).toContainText('@mubaraqabba')
    await expect(joiners.getByTestId('kol-board-row')).toContainText('Founder #001')
    await expect(joiners.getByTestId('kol-board-row')).toContainText('Reach 44')
    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/kol-hub-real-board-390x700.png',
    })
    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/kol-hub-real-board-full.png',
      fullPage: true,
    })
    await page.getByTestId('kol-tab-board').click()
    await expect(page).toHaveURL(/\/kol\/leaderboard/)
    await expect(page.getByTestId('kol-tab-board')).toHaveClass(/is-active/)
    await expect(page.getByTestId('kol-tab-alerts')).not.toHaveClass(/is-active/)
    await expect(page.getByTestId('kol-season-podium')).toBeInViewport()
    await expect(page.getByTestId('kol-season-chip')).toBeVisible()
    await expect(page.getByText('Season treasury pool')).toHaveCount(0)
    await expect(page.getByTestId('kol-how-rewards')).toContainText('Points have no cash value')
    await expect(page.getByTestId('kol-board-row').first()).toContainText('@mubaraqabba')
    await expect(page.getByTestId('kol-board-row').first()).toContainText('0 pts')
    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/kol-leaderboard-real-board-390x700.png',
    })
  })

  test('/kol signed-out board uses hub.rows even if leaderboard fails', async ({ page }) => {
    const row = {
      rank: 1,
      handle: 'mubaraqabba',
      displayName: 'Mubarak Yakubu',
      avatarUrl: null,
      seasonPoints: 0,
      reachScore: 44,
      tier: 'silver',
      founderNumber: 1,
    }
    await page.route('**/api/kol-program/leaderboard*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) }),
    )
    await page.route('**/api/kol-program/me', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'KOL session required' }),
      }),
    )
    await page.route('**/api/kol-program/hub', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          seasonId: 'season_test',
          seasonEndsAt: new Date(Date.now() + 15 * 86400000).toISOString(),
          foundingSnapshotAt: new Date(Date.now() + 14 * 86400000).toISOString(),
          memberCount: 1,
          showMemberCount: false,
          rows: [row],
          recentJoiners: [
            {
              handle: 'mubaraqabba',
              displayName: 'Mubarak Yakubu',
              avatarUrl: null,
              enrolledAt: new Date().toISOString(),
              founderNumber: 1,
              reachScore: 44,
              tier: 'silver',
            },
          ],
          referralMilestones: [],
          disclaimer: 'Points have no cash value.',
        }),
      }),
    )
    await page.setViewportSize({ width: 390, height: 700 })
    await page.goto('/kol', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('kol-leaderboard-empty')).toHaveCount(0)
    await expect(page.getByTestId('kol-board-row').first()).toContainText('@mubaraqabba')
    await expect(page.getByTestId('kol-hub-stats')).toBeVisible()
    await expect(page.getByTestId('kol-hub-joiners')).toContainText('Founder #001')
  })

  test('/kol/mubaraqabba shows the claimed card, not Claim your card', async ({ page }) => {
    await page.route('**/api/kols/registered/mubaraqabba*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profile: {
            xUsername: 'mubaraqabba',
            xName: 'Mubarak Yakubu',
            xVerified: false,
            followers: 120,
            following: 10,
            tweetCount: 20,
            profileImageUrl: null,
            description: '',
            wallet: '',
            registeredAt: new Date().toISOString(),
            rank: 1,
          },
          performance: {
            coinsHired: 0,
            coinsLaunched: 0,
            solReceived: 0,
            remitCount: 0,
            coins: [],
            remits: [],
          },
        }),
      }),
    )
    await page.route('**/api/kol-program/public/mubaraqabba', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          card: {
            handle: 'mubaraqabba',
            claimed: true,
            unclaimed: false,
            displayName: 'Mubarak Yakubu',
            avatarUrl: null,
            reachScore: 44,
            tier: 'silver',
            rank: 1,
            founderNumber: 1,
            referralUrl: 'https://crewpay.dev/ref/mubaraqabba',
            cardUrl: 'https://api.crewpay.dev/api/kol-program/card/mubaraqabba.png',
            profileUrl: 'https://crewpay.dev/kol/mubaraqabba',
            scoreBars: [{ label: 'Reach', value: 44 }],
            lookupOk: true,
            xVerified: false,
            seasonPoints: 0,
            memberNumber: 1,
            notionalInfluenceValueUsd: 0,
          },
        }),
      }),
    )
    await page.setViewportSize({ width: 390, height: 700 })
    await page.goto('/kol/mubaraqabba', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('kol-public-card')).toBeVisible()
    await expect(page.getByTestId('claim-kol-card')).toHaveCount(0)
    await expect(page.getByText('Claim your card')).toHaveCount(0)
    await expect(page.getByTestId('kol-tab-board')).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Launch Coin' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Register as KOL to get Paid' })).toHaveCount(0)
    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/kol-mubaraqabba-claimed-card-390x700.png',
    })
  })

  test('/kol/alerts signed-out is Notifications, not a handle card', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 })
    await page.goto('/kol/alerts', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('kol-alerts-page')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'All' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Replies' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Points' })).toBeVisible()
    await expect(page.getByTestId('kol-alerts-sign-in-x')).toBeVisible()
    await expect(page.getByText('Claim your card')).toHaveCount(0)
    await expect(page.getByText('@alerts')).toHaveCount(0)
    await expect(page.getByTestId('kol-tab-alerts')).toHaveClass(/is-active/)
    await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/kol-alerts-signedout-390x700.png' })
  })

  test('/kol/tasks is the ladder, not an @tasks card', async ({ page }) => {
    await page.route('**/api/kol-program/public/tasks', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Reserved path — not a KOL handle.' }),
      }),
    )
    await page.setViewportSize({ width: 390, height: 700 })
    await page.goto('/kol/tasks', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('kol-task-ladder')).toBeVisible()
    await expect(page.getByTestId('kol-daily-cap')).toContainText('0 / 5,000 today')
    await expect(page.getByTestId('kol-tasks-sign-in-x')).toBeVisible()
    await expect(page.getByTestId('kol-ladder-segments').locator('i')).toHaveCount(2)
    await expect(page.getByRole('tab', { name: 'Tasks' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Referrals' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Founding' })).toBeVisible()
    const start = page.getByTestId('kol-ladder-step-connect_x').getByRole('button', { name: 'Start' })
    await expect(start).toBeVisible()
    await expect(page.getByTestId('kol-ladder-step-connect_x').getByRole('button', { name: 'Sign in with X' })).toHaveCount(0)
    const startBg = await start.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(startBg === 'rgba(0, 0, 0, 0)' || startBg === 'transparent').toBeFalsy()
    await expect(page.getByText('Unlocks after the task above')).toBeVisible()
    await expect(page.getByText('Claim your card')).toHaveCount(0)
    await expect(page.getByText('@tasks')).toHaveCount(0)
    await expect(page.getByTestId('kol-public-card')).toHaveCount(0)
    await expect(page.getByTestId('kol-tab-tasks')).toHaveClass(/is-active/)
    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/kol-tasks-signedout-ladder-390x700.png',
    })
  })

  test('header GitHub icon follows Telegram and opens in a new tab', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const github = page.getByTestId('nav-link-github')
    await expect(github).toBeVisible()
    await expect(github).toHaveAttribute('href', 'https://github.com/fxams/crew')
    await expect(github).toHaveAttribute('target', '_blank')
    await expect(github).toHaveAttribute('rel', /noopener/)
    const socials = page.locator('.nav-socials a')
    await expect(socials).toHaveCount(4)
    await expect(socials.nth(2)).toHaveAttribute('aria-label', 'Telegram @CrewPayHQ')
    await expect(socials.nth(3)).toHaveAttribute('aria-label', 'GitHub fxams/crew')
  })
})
