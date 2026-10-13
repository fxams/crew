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
