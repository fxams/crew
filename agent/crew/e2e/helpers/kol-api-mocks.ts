import type { Page, Route } from '@playwright/test'

export const MOCK_SID = 'abababababababababababababababab'

export const registerStatusBody = {
  xOauth: true,
  walletOptional: true,
  telegram: {
    enabled: true,
    botUsername: 'CrewPay_Bot',
    botUrl: 'https://t.me/CrewPay_Bot',
    botId: 8498303567,
    login: true,
  },
  privy: { enabled: true, appId: 'test-privy-app-id' },
}

export const emptyBoardBody = {
  ok: true,
  leaderboard: [],
  tape: [],
  total: 0,
  rankedBy: 'sol_earned',
}

/** Matches production API shape — object formula must not crash KolProgramPanel. */
export const kolProgramStatusBody = {
  ok: true,
  enabled: true,
  pointsDisclaimer: 'Points have no cash value.',
  referralFeeMap: '60/15/5/20 when referred.',
  reachFormula: {
    weights: { followers: 0.3, impressions: 0.25 },
    caps: { accountAgeYears: 3 },
    tiers: { bronze: [0, 39] },
  },
}

export async function resetKolClientState(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear()
    sessionStorage.clear()
    const loc = window.location
    loc.assign = (url: string | URL) => {
      ;(window as unknown as { __crewAssignUrl?: string }).__crewAssignUrl = String(url)
    }
  })
}

export async function mockKolRegisterApis(
  page: Page,
  opts?: {
    onStart?: () => void
    progress?: { status: string; handle?: string }
    registeredHandle?: string | null
    deskProfile?: Record<string, unknown>
  },
) {
  await page.route('**/api/kols/register/status', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(registerStatusBody) }),
  )
  await page.route('**/api/kols/registered?*', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyBoardBody) }),
  )
  await page.route('**/api/proof', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ leaderboard: [] }) }),
  )
  await page.route('**/api/kol-program/hub', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        seasonId: 'season_test',
        seasonEndsAt: new Date(Date.now() + 86400000 * 12).toISOString(),
        memberCount: 0,
        recentJoiners: [],
        rows: [],
        referralMilestones: [
          { referrals: 5, bonusPoints: 1000 },
          { referrals: 25, bonusPoints: 5000 },
          { referrals: 100, bonusPoints: 25000 },
        ],
        disclaimer: 'Points have no cash value.',
      }),
    }),
  )
  await page.route('**/api/kol-program/status', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(kolProgramStatusBody),
    }),
  )
  await page.route('**/api/kol-program/me', (route: Route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false }) }),
  )
  await page.route('**/api/kol-program/notifications**', (route: Route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false }),
    }),
  )
  await page.route('**/api/kol-program/tasks/today', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        dayUtc: '2026-10-17',
        tasks: [
          {
            id: 'today_like',
            slug: 'today-like',
            title: 'Like today’s @CrewPayHQ post',
            instructions: 'Like the newest @CrewPayHQ post. Resets 00:00 UTC.',
            points: 250,
            completed: false,
            locked: true,
            kind: 'today',
          },
        ],
        tweetId: null,
        resetIn: '6h',
        pointsToday: 0,
        pointsCap: 5000,
        disclaimer: 'Points have no cash value.',
      }),
    }),
  )
  await page.route('**/api/kol-program/onboarding', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        signedIn: false,
        steps: [
          {
            id: 'connect_x',
            title: 'Connect X',
            points: 0,
            order: 1,
            completed: false,
            unlocked: true,
            icon: '𝕏',
            hint: 'Sign in with X to start the ladder.',
          },
          {
            id: 'follow_hq',
            title: 'Follow @CrewPayHQ',
            points: 2000,
            order: 2,
            completed: false,
            unlocked: false,
            hint: 'Follow @CrewPayHQ on X, then verify.',
          },
        ],
        nextStep: 'connect_x',
        pointsToday: 0,
        pointsCap: 5000,
        referralUrl: '',
        pinnedPostId: null,
      }),
    }),
  )
  await page.route('**/api/kol-program/leaderboard*', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        seasonId: 'season_test',
        rows: [],
        disclaimer: 'Points have no cash value.',
        pool: null,
      }),
    }),
  )
  await page.route('**/api/kol-program/hall-of-fame*', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, seasons: [] }),
    }),
  )
  await page.route('**/api/kol-program/profile/**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        profile: {
          handle: 'CrewPayHQ',
          reachScore: 88,
          tier: 'platinum',
          founderNumber: 1,
        },
      }),
    }),
  )
  await page.route('**/api/kol-program/seasons*', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        seasons: [],
        archive: null,
        archiveSeasonId: null,
        hallOfFame: null,
      }),
    }),
  )
  await page.route('**/api/kols/register/start', async (route: Route) => {
    opts?.onStart?.()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        authorizeUrl: 'https://x.com/i/oauth2/authorize?e2e=1',
        sid: MOCK_SID,
        expiresAt: Date.now() + 600_000,
      }),
    })
  })
  await page.route('**/api/kols/register/progress*', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, status: opts?.progress?.status || 'unknown', handle: opts?.progress?.handle }),
    }),
  )
  await page.route('**/api/kols/me', (route: Route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false }) }),
  )
  const handle = opts?.registeredHandle
  await page.route('**/api/kols/registered/**', async (route: Route) => {
    const url = route.request().url()
    if (url.includes('/wallet/')) {
      if (!handle) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          profile: { xUsername: handle, wallet: '', followers: 0, rank: 1 },
          performance: { coinsHired: 0, coinsLaunched: 0, solReceived: 0, remitCount: 0, coins: [], remits: [] },
        }),
      })
      return
    }
    const match = url.match(/registered\/([^/?]+)/)
    const h = decodeURIComponent(match?.[1] || '')
    const deskUser = (opts?.deskProfile as { profile?: { xUsername?: string } } | undefined)?.profile
      ?.xUsername
    if (opts?.deskProfile && deskUser && h.toLowerCase() === deskUser.toLowerCase()) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(opts.deskProfile),
      })
      return
    }
    if (h === 'notregistered') {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
  })
}

export async function blockXOauthAutoRestart(page: Page) {
  await page.addInitScript(() => {
    const now = Date.now()
    localStorage.setItem('crew_reg_x_autorestart', String(now))
    sessionStorage.setItem('crew_reg_x_autorestart', String(now))
  })
}

export function pendingStorageScript() {
  const payload = JSON.stringify({
    wallet: '',
    startedAt: Date.now(),
    sid: 'abababababababababababababababab',
  })
  return `localStorage.setItem('crew_reg_pending', ${JSON.stringify(payload)});
sessionStorage.setItem('crew_reg_pending', ${JSON.stringify(payload)});`
}
