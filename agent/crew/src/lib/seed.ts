import type { CoinRecord, RemitRecord } from './types'
import { DEFAULT_BUYBACK, DEFAULT_RAID_QUESTS } from './edges'

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
      raidQuests: DEFAULT_RAID_QUESTS.map((q) => ({ ...q })),
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
    {
      id: 'seed_floor',
      mint: 'CrewFloorDemo3333333333333333333333333333333',
      name: 'Floor Guard',
      ticker: 'FLOOR',
      vibe: 'Dip desk with explicit buyback rules.',
      mode: 'buyback',
      crew: [
        { handle: '@caller', wallet: '', share: 55 },
        { handle: '@analyst', wallet: '', share: 45 },
      ],
      network: 'demo',
      signature: 'seed',
      launchedAt: now - 28 * 60_000,
      launcher: 'demo',
      pumpUrl: 'https://pump.fun',
      buybackRule: { ...DEFAULT_BUYBACK, dipPct: 22 },
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
    {
      id: 'r4',
      mint: coins[2].mint,
      ticker: 'FLOOR',
      handle: '@caller',
      wallet: '',
      amountSol: 0.0275,
      mode: 'buyback',
      at: now - 8 * 60_000,
      network: 'demo',
    },
    {
      id: 'r5',
      mint: coins[2].mint,
      ticker: 'FLOOR',
      handle: '@analyst',
      wallet: '',
      amountSol: 0.0198,
      mode: 'buyback',
      at: now - 11 * 60_000,
      network: 'demo',
    },
  ]
}
