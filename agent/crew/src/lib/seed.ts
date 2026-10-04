import type { CoinRecord, RemitRecord } from './types'

export function seedCoins(): CoinRecord[] {
  const now = Date.now()
  return [
    {
      id: 'seed_frog',
      mint: 'CrewFrogDemo1111111111111111111111111111111',
      name: 'Raid Frog',
      ticker: 'FROG',
      vibe: 'CT frog with a raid pool.',
      mode: 'raid',
      crew: [
        { handle: '@frogcaller', wallet: '', share: 40 },
        { handle: '@chartwitch', wallet: '', share: 35 },
        { handle: '@solana', wallet: '', share: 25 },
      ],
      network: 'demo',
      signature: 'seed',
      launchedAt: now - 42 * 60_000,
      launcher: 'demo',
      pumpUrl: 'https://pump.fun',
    },
    {
      id: 'seed_desk',
      mint: 'CrewDeskDemo2222222222222222222222222222222',
      name: 'Desk Dog',
      ticker: 'DESK',
      vibe: 'Fee split desk dog.',
      mode: 'split',
      crew: [
        { handle: '@bigdavesolan', wallet: '', share: 60 },
        { handle: '@pumpfun', wallet: '', share: 40 },
      ],
      network: 'demo',
      signature: 'seed',
      launchedAt: now - 95 * 60_000,
      launcher: 'demo',
      pumpUrl: 'https://pump.fun',
    },
  ]
}

export function seedRemits(coins: CoinRecord[]): RemitRecord[] {
  const now = Date.now()
  return [
    {
      id: 'r1',
      mint: coins[0].mint,
      ticker: 'FROG',
      handle: '@frogcaller',
      wallet: '',
      amountSol: 0.0184,
      mode: 'raid',
      at: now - 3 * 60_000,
      network: 'demo',
    },
    {
      id: 'r2',
      mint: coins[1].mint,
      ticker: 'DESK',
      handle: '@bigdavesolan',
      wallet: '',
      amountSol: 0.0412,
      mode: 'split',
      at: now - 14 * 60_000,
      network: 'demo',
    },
    {
      id: 'r3',
      mint: coins[0].mint,
      ticker: 'FROG',
      handle: '@chartwitch',
      wallet: '',
      amountSol: 0.0121,
      mode: 'raid',
      at: now - 21 * 60_000,
      network: 'demo',
    },
  ]
}
