import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4173'
const outDir = '/opt/cursor/artifacts/screenshots'

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage()

await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${base}/sui`, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${outDir}/sui-mobile.png`, fullPage: true })

await page.setViewportSize({ width: 1280, height: 900 })
await page.goto(`${base}/sui`, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${outDir}/sui-desktop.png`, fullPage: true })

await page.goto(`${base}/coins`, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${outDir}/coins-sui-link.png`, fullPage: true })

await browser.close()
console.log('saved to', outDir)
