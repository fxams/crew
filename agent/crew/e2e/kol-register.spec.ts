import { expect, test } from '@playwright/test'
import {
  blockXOauthAutoRestart,
  mockKolRegisterApis,
  pendingStorageScript,
  resetKolClientState,
} from './helpers/kol-api-mocks'

test.describe('KOL /register — fresh entry', () => {
  test.beforeEach(async ({ page }) => {
    await resetKolClientState(page)
    await mockKolRegisterApis(page)
  })

  test('shows primary CTAs and steps', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByRole('heading', { name: /join the crew/i })).toBeVisible()
    await expect(page.getByTestId('register-join')).toBeVisible()
    await expect(page.getByTestId('register-with-x')).toBeVisible()
    await expect(page.getByTestId('telegram-continue')).toBeVisible()
    await expect(page.getByTestId('register-connect-wallet')).toBeVisible()
  })

  test('pending X shows Check control', async ({ page }) => {
    await page.addInitScript(pendingStorageScript())
    await page.goto('/register')
    await expect(page.getByTestId('register-check')).toBeVisible()
  })
})

test.describe('KOL /register — X OAuth recovery', () => {
  test.beforeEach(async ({ page }) => {
    await resetKolClientState(page)
    await mockKolRegisterApis(page)
    await blockXOauthAutoRestart(page)
  })

  test('already-used shows Start over recovery', async ({ page }) => {
    await page.goto(
      '/register?error=This%20sign-in%20was%20already%20used.&xoauth=used',
    )
    await expect(page.getByTestId('register-start-over')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('register-x-recovery')).toBeVisible()
    await expect(page.getByTestId('register-start-over')).toBeVisible()
    await expect(page.getByTestId('register-check')).toBeVisible()
    await expect(page).toHaveURL(/\/register(?!.*xoauth=)/)
  })

  test('expired shows Start over recovery', async ({ page }) => {
    await page.goto('/register?error=Sign-in%20expired.&xoauth=expired')
    await expect(page.getByTestId('register-x-recovery')).toBeVisible()
    await expect(page.getByText(/expired/i)).toBeVisible()
  })

  test('cancelled does not auto-loop to X', async ({ page }) => {
    await page.goto('/register?error=access_denied&xoauth=cancelled')
    await expect(page.getByTestId('register-x-recovery')).toBeVisible()
    await expect(page.getByText(/cancelled/i)).toBeVisible()
    await expect(page).toHaveURL(/\/register/)
  })

  test('pending registration shows Check for cross-browser recovery', async ({ page }) => {
    await page.addInitScript(pendingStorageScript())
    await page.goto('/register')
    await expect(page.getByTestId('register-join').getByTestId('register-check')).toBeVisible()
  })
})

test.describe('KOL /register — handle lookup', () => {
  test.beforeEach(async ({ page }) => {
    await resetKolClientState(page)
    await mockKolRegisterApis(page)
  })

  test('unknown handle offers register recovery', async ({ page }) => {
    await page.goto('/register')
    await page.getByTestId('handle-lookup-input').fill('notregistered')
    await page.getByTestId('handle-lookup').getByTestId('handle-lookup-submit').click()
    await expect(page.getByTestId('handle-lookup-missing')).toBeVisible()
    await expect(page.getByTestId('handle-lookup-missing-action')).toBeVisible()
  })
})

test.describe('KOL /register — wallet connect', () => {
  test.beforeEach(async ({ page }) => {
    await resetKolClientState(page)
    await mockKolRegisterApis(page)
  })

  test('opens connect modal from register', async ({ page }) => {
    await page.goto('/register')
    await page.getByTestId('register-connect-wallet').click()
    await expect(page.getByTestId('connect-modal')).toBeVisible()
  })
})

test.describe('KOL desk', () => {
  test.beforeEach(async ({ page }) => {
    await resetKolClientState(page)
  })

  test('loads registered desk', async ({ page }) => {
    await mockKolRegisterApis(page, {
      deskProfile: {
        ok: true,
        profile: {
          xUsername: 'qauser',
          xName: 'QA User',
          xVerified: false,
          followers: 100,
          wallet: '',
          rank: 1,
          registeredAt: new Date().toISOString(),
        },
        performance: {
          coinsHired: 0,
          coinsLaunched: 0,
          solReceived: 0,
          remitCount: 0,
          coins: [],
          remits: [],
        },
      },
    })
    await page.goto('/kol/qauser?registered=1&from=x')
    await expect(page.getByTestId('kol-desk-page')).toBeVisible()
    await expect(page.getByTestId('desk-registered-banner')).toBeVisible()
    await expect(page.getByTestId('desk-wallet-check-hint')).toBeVisible()
  })

  test('missing desk links to register', async ({ page }) => {
    await mockKolRegisterApis(page)
    await page.goto('/kol/notregistered')
    await expect(
      page.getByTestId('kol-desk-page').getByRole('link', { name: /^Register$/i }),
    ).toBeVisible()
  })
})

test.describe('KOL /register — mobile wallet browse links', () => {
  test('shows Phantom / Solflare / Backpack on mobile', async ({ page }, testInfo) => {
    test.skip(!/mobile/.test(testInfo.project.name), 'mobile viewport only')
    await resetKolClientState(page)
    await mockKolRegisterApis(page)
    await page.goto('/register')
    await expect(page.getByTestId('open-in-phantom')).toBeVisible()
    await expect(page.getByTestId('open-in-solflare')).toBeVisible()
    await expect(page.getByTestId('open-in-backpack')).toBeVisible()
  })
})

test.describe('KOL /register — returning user', () => {
  test('registered query shows desk link', async ({ page }) => {
    await resetKolClientState(page)
    await mockKolRegisterApis(page)
    await page.goto('/register?registered=1&handle=returningkol')
    await expect(page.getByText(/registered as @returningkol/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /open desk/i })).toBeVisible()
  })
})

test.describe('Telegram login', () => {
  test('Continue with Telegram uses oauth.telegram.org fallback', async ({ page }) => {
    await resetKolClientState(page)
    await mockKolRegisterApis(page)
    await page.goto('/register')
    await expect(page.getByTestId('telegram-continue')).toHaveAttribute('href', /oauth\.telegram\.org/)
  })
})
