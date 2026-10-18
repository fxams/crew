import { expect, test } from '@playwright/test'
import { mockKolRegisterApis, resetKolClientState } from './helpers/kol-api-mocks'

const FILLED = {
  ok: true,
  generatedAt: Date.now(),
  role: 'desk',
  shareBps: 1500,
  source: 'proof remits + launches',
  disclaimer:
    'Creator fees follow trading volume and can be zero. Totals are cranked on-chain remits with role desk (15% launching agent) — not projected earnings.',
  empty: false,
  emptyReason: null,
  rows: [
    {
      rank: 1,
      wallet: 'DeskWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      agentName: 'DeskCat',
      xHandle: 'realKol',
      coinsLaunched: 2,
      earnedSol: 0.0015,
      earnedEth: 0,
      lastPayoutAt: 1_700_000_000_000,
      lastPayoutSignature: 'sig1',
      lastPayoutMint: 'So11111111111111111111111111111111111111112',
    },
  ],
}

const EMPTY = {
  ok: true,
  generatedAt: Date.now(),
  role: 'desk',
  shareBps: 1500,
  source: 'proof remits + launches',
  disclaimer:
    'Creator fees follow trading volume and can be zero. Totals are cranked on-chain remits with role desk (15% launching agent) — not projected earnings.',
  empty: true,
  emptyReason:
    'No role=desk remits on the proof tape yet. When coins trade and fees are cranked, launching-agent payouts show up here.',
  rows: [],
}

test.describe('agent leaderboard', () => {
  test.beforeEach(async ({ page }) => {
    await resetKolClientState(page)
    await mockKolRegisterApis(page)
  })

  test('/agents/earn shows slim ranked rows from the API', async ({ page }) => {
    await page.route('**/api/agents/leaderboard*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FILLED) }),
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/agents/earn', { waitUntil: 'domcontentloaded' })
    const board = page.getByTestId('agent-leaderboard')
    await expect(board).toBeVisible()
    await expect(board.getByTestId('agent-board-row')).toHaveCount(1)
    await expect(board).toContainText('DeskCat')
    await expect(board).toContainText('0.0015 SOL')
    await expect(board).not.toContainText('@launcher')
    await expect(board.getByTestId('agent-leaderboard-empty')).toHaveCount(0)
  })

  test('/agents compact top-5 uses the same honest empty state', async ({ page }) => {
    await page.route('**/api/agents/leaderboard*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY) }),
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/agents', { waitUntil: 'domcontentloaded' })
    const board = page.getByTestId('agent-leaderboard-top5')
    await expect(board).toBeVisible()
    await expect(board.getByTestId('agent-leaderboard-empty')).toBeVisible()
    await expect(board.getByTestId('agent-leaderboard-empty')).toContainText('No role=desk remits')
    await expect(board.getByTestId('agent-board-row')).toHaveCount(0)
    await expect(board).not.toContainText('0.00 SOL')
  })

  test('coin page shows agent earned only when the API returns remits', async ({ page }) => {
    const mint = 'So11111111111111111111111111111111111111112'
    await page.route(`**/api/coins/${mint}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          coin: {
            mint,
            name: 'Desk Cat',
            ticker: 'DCAT',
            launcher: 'DeskWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            pumpUrl: `https://pump.fun/coin/${mint}`,
            launchedAt: Date.now(),
            crew: [],
          },
          agentEarned: {
            wallet: 'DeskWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            agentName: 'DeskCat',
            xHandle: null,
            earnedSol: 0.00021,
            earnedEth: 0,
            lastPayoutAt: 1_700_000_000_000,
            lastPayoutSignature: 'sig-coin',
            remitCount: 2,
          },
        }),
      }),
    )
    await page.route(`**/api/coins/${mint}/kit`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }),
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/coin/${mint}`, { waitUntil: 'domcontentloaded' })
    const panel = page.getByTestId('coin-agent-earned')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('Agent earned')
    await expect(panel).toContainText('0.0002 SOL')
  })
})
