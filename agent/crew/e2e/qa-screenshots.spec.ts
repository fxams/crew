import { test } from '@playwright/test'
import path from 'node:path'
import { blockXOauthAutoRestart, mockKolRegisterApis, resetKolClientState } from './helpers/kol-api-mocks'

const outDir = path.join(import.meta.dirname, '..', 'docs', 'qa', 'screenshots')

test.describe('QA screenshots (desktop)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'desktop only')
    await resetKolClientState(page)
    await mockKolRegisterApis(page)
    await blockXOauthAutoRestart(page)
  })

  test('capture X OAuth recovery states', async ({ page }) => {
    await page.goto('/register?error=This%20sign-in%20was%20already%20used.&xoauth=used')
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(outDir, 'x-oauth-used-recovery.png'), fullPage: true })

    await page.goto('/register?error=Sign-in%20expired.&xoauth=expired')
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(outDir, 'x-oauth-expired-recovery.png'), fullPage: true })

    await page.goto('/register?error=access_denied&xoauth=cancelled')
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(outDir, 'x-oauth-cancelled-recovery.png'), fullPage: true })
  })
})
