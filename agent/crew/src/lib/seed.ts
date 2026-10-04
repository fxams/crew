import type { Coin, Remit } from './types'

export function seedCoins(): Coin[] {
  const now = Date.now()
  return [
    {
      id: 'seed_frog',
      ca: 'CrewFrog11111111111111111111111111111111111',
      name: 'Raid Frog',
      ticker: 'FROG',
      description: 'CT frog with a raid pool. Tag the callers.',
      mode: 'raid-pool',
      crew: [
        { handle: 'frogcaller', bps: 4000 },
        { handle: 'chartwitch', bps: 3500 },
        { handle: 'solana', bps: 2500 },
      ],
      launchedAt: now - 1000 * 60 * 42,
      demo: true,
    },
    {
      id: 'seed_desk',
      ca: 'CrewDesk22222222222222222222222222222222222',
      name: 'Desk Dog',
      ticker: 'DESK',
      description: 'Fee split desk dog. Everyone on the tape gets paid.',
      mode: 'fee-split',
      crew: [
        { handle: 'bigdavesolan', bps: 6000 },
        { handle: 'pumpfun', bps: 4000 },
      ],
      launchedAt: now - 1000 * 60 * 95,
      demo: true,
    },
    {
      id: 'seed_dip',
      ca: 'CrewDip333333333333333333333333333333333333',
      name: 'Dip Witch',
      ticker: 'DIP',
      description: 'Buys the red candles with crew fees.',
      mode: 'dip-buyback',
      crew: [
        { handle: 'beffjezos', bps: 5000 },
        { handle: 'mangotoogood', bps: 3000 },
        { handle: 'a1lon9', bps: 2000 },
      ],
      launchedAt: now - 1000 * 60 * 140,
      demo: true,
    },
  ]
}

export function seedRemits(coins: Coin[]): Remit[] {
  const now = Date.now()
  const rows: Remit[] = []
  const samples = [
    [0, 'frogcaller', 0.0184, 2.73, 3],
    [0, 'chartwitch', 0.0121, 1.79, 8],
    [1, 'bigdavesolan', 0.0412, 6.11, 14],
    [1, 'pumpfun', 0.0274, 4.06, 21],
    [2, 'beffjezos', 0.033, 4.89, 33],
    [2, 'mangotoogood', 0.0198, 2.93, 41],
    [0, 'solana', 0.0095, 1.41, 55],
    [2, 'a1lon9', 0.0112, 1.66, 67],
  ] as const

  for (const [coinIdx, handle, amountSol, amountUsd, mins] of samples) {
    const coin = coins[coinIdx]
    rows.push({
      id: `seed_remit_${coinIdx}_${handle}`,
      coinId: coin.id,
      ticker: coin.ticker,
      handle,
      amountSol,
      amountUsd,
      mode: coin.mode,
      at: now - mins * 60_000,
    })
  }

  return rows.sort((a, b) => b.at - a.at)
}
