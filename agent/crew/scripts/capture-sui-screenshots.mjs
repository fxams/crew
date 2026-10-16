import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4173'
const outDir = '/opt/cursor/artifacts/screenshots'

const disabledConfig = {
  enabled: false,
  network: 'testnet',
  launchpadBackend: null,
  packageId: null,
  publishedAt: null,
  configId: null,
  graphqlUrl: null,
  explorer: 'suiscan',
  tradeFeeBps: 120,
  nearGraduationProgressBps: 7000,
}

const enabledConfig = {
  ...disabledConfig,
  enabled: true,
  launchpadBackend: 'crewpay',
  packageId: '0x37cf5eccf86586fb10866c4a703e2098e2462aa437cb48100c04ba5ca57e3f64',
  configId: '0x3360244e91cdfbd66c4e7086b1f8e57659c923eb610637f0541733246282895a',
  graphqlUrl: 'https://sui-testnet.mystenlabs.com/graphql',
}

const mockPools = {
  ok: true,
  pools: [
    {
      poolId: '0x268c853247f5f4b2314a4488930826746769413592310e46af0f4c783bd11020',
      memeCoinType: '0x2::example::MEME',
      launcher: '0x1',
      targetSui: '100000000000',
      suiReserve: '100000000000',
      memeReserve: '1000000',
      virtualSui: '1000000000',
      virtualMeme: '1000000',
      graduated: true,
      migrated: true,
      progressBps: 10000,
      stage: 'migrated',
      name: 'Crew test migrated',
      symbol: 'CTM',
    },
    {
      poolId: '0xdfff986f6a12c29e5fba0fe60bae7bc9c65ca0f94de0a0a43bf54cb83cba85bd',
      memeCoinType: '0x2::example::MEME2',
      launcher: '0x1',
      targetSui: '100000000000',
      suiReserve: '100000000000',
      memeReserve: '500000',
      virtualSui: '1000000000',
      virtualMeme: '500000',
      graduated: true,
      migrated: true,
      progressBps: 10000,
      stage: 'migrated',
      name: 'Legacy migrated pool',
      symbol: 'LMP',
    },
    {
      poolId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      memeCoinType: '0x2::example::NEW',
      launcher: '0x2',
      targetSui: '50000000000',
      suiReserve: '12000000000',
      memeReserve: '900000',
      virtualSui: '1000000000',
      virtualMeme: '1000000',
      graduated: false,
      migrated: false,
      progressBps: 2400,
      stage: 'new',
      name: 'Fresh curve',
      symbol: 'FRESH',
    },
  ],
}

async function mockLaunchpadApi(page, { enabled }) {
  await page.route('**/api/sui/launchpad/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(enabled ? enabledConfig : disabledConfig),
    })
  })
  await page.route('**/api/sui/launchpad/pools', async (route) => {
    if (!enabled) {
      await route.fulfill({ status: 404, body: JSON.stringify({ ok: false }) })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockPools),
    })
  })
}

async function shot(page, name, viewport) {
  await page.setViewportSize(viewport)
  await page.goto(`${base}/sui`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.sui-page-top-badge', { timeout: 15_000 })
  if (name.includes('disabled')) {
    await page.waitForSelector('text=Coming soon', { timeout: 15_000 })
  } else {
    await page.waitForSelector('text=Migrated to Cetus', { timeout: 15_000 })
  }
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true })
}

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()

for (const [label, enabled] of [
  ['disabled', false],
  ['enabled', true],
]) {
  const page = await browser.newPage()
  await mockLaunchpadApi(page, { enabled })
  await shot(page, `sui-${label}-mobile`, { width: 390, height: 844 })
  await shot(page, `sui-${label}-desktop`, { width: 1280, height: 900 })
  await page.close()
}

await browser.close()
console.log('saved to', outDir)
