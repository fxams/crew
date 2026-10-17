import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4173'
const outDir = '/opt/cursor/artifacts/screenshots'

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage()

async function shot(name, width) {
  await page.setViewportSize({ width, height: width < 500 ? 900 : 1000 })
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  const row = page.locator('.plat-chip-row').first()
  await row.waitFor({ state: 'visible', timeout: 20_000 })
  await row.screenshot({ path: `${outDir}/${name}.png` })
}

await shot('platform-chips-mobile-390', 390)
await shot('platform-chips-desktop-1280', 1280)

await browser.close()
console.log('saved to', outDir)
