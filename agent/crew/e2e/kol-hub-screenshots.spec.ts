import { test } from '@playwright/test'
import { mockKolRegisterApis, resetKolClientState } from './helpers/kol-api-mocks'

const outDir = '/opt/cursor/artifacts/screenshots'

test.describe('KOL hub mobile screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await resetKolClientState(page)
    await mockKolRegisterApis(page)
  })

  test('capture /kol landing and leaderboard', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/kol')
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${outDir}/kol-hub-landing-mobile.png`, fullPage: true })

    await page.goto('/kol/leaderboard')
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${outDir}/kol-leaderboard-mobile.png`, fullPage: true })

    await page.goto('/ref/CrewPayHQ')
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${outDir}/kol-ref-mobile.png`, fullPage: true })
  })
})
