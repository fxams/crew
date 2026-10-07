import { describe, expect, it } from 'vitest'
import {
  simulateBuybackFire,
  simulateFeeAccrual,
  simulateRaidClaim,
  solscanTokenUrl,
} from './desk-actions'
import type { CoinRecord } from './types'
import { DEFAULT_BUYBACK, DEFAULT_RAID_QUESTS } from './edges'

const splitCoin: CoinRecord = {
  id: 'c1',
  mint: 'So11111111111111111111111111111111111111112',
  name: 'A',
  ticker: 'AAA',
  vibe: 'v',
  mode: 'split',
  crew: [
    { handle: '@a', wallet: '11111111111111111111111111111112', share: 70 },
    { handle: '@b', wallet: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', share: 30 },
  ],
  signature: 'x',
  launchedAt: 1,
  launcher: '11111111111111111111111111111111',
  pumpUrl: 'https://pump.fun/coin/So11111111111111111111111111111111111111112',
}

describe('simulateFeeAccrual', () => {
  it('splits fees to crew totaling the fee amount', () => {
    const remits = simulateFeeAccrual(splitCoin, 0.1)
    const total = remits.reduce((s, r) => s + r.amountSol, 0)
    expect(total).toBeCloseTo(0.1, 3)
    expect(remits.find((r) => r.handle === '@crew-buyback')?.amountSol).toBeCloseTo(0.025, 3)
    const crew = remits.filter((r) => r.handle === '@a' || r.handle === '@b')
    expect(crew.reduce((s, r) => s + r.amountSol, 0)).toBeCloseTo(0.075, 3)
  })

  it('reserves desk share for buyback mode', () => {
    const coin: CoinRecord = {
      ...splitCoin,
      mode: 'buyback',
      buybackRule: { ...DEFAULT_BUYBACK },
    }
    const remits = simulateFeeAccrual(coin, 0.1)
    expect(remits.find((r) => r.handle === '@crew-buyback')?.amountSol).toBeCloseTo(0.025, 3)
    const desk = remits.find((r) => r.handle === '@buyback')
    expect(desk?.amountSol).toBeCloseTo(0.02, 3)
    const crew = remits.filter((r) => r.handle === '@a' || r.handle === '@b')
    expect(crew.reduce((s, r) => s + r.amountSol, 0)).toBeCloseTo(0.055, 3)
  })
})

describe('simulateBuybackFire', () => {
  it('fires within max SOL', () => {
    const coin: CoinRecord = {
      ...splitCoin,
      mode: 'buyback',
      buybackRule: { dipPct: 20, maxSolPerFire: 0.25, cooldownHours: 4 },
    }
    const r = simulateBuybackFire(coin)
    expect(r.handle).toBe('@buyback')
    expect(r.amountSol).toBeGreaterThan(0)
    expect(r.amountSol).toBeLessThanOrEqual(0.25)
  })
})

describe('simulateRaidClaim', () => {
  it('pays a crew member from a quest', () => {
    const coin: CoinRecord = {
      ...splitCoin,
      mode: 'raid',
      raidQuests: DEFAULT_RAID_QUESTS.map((q) => ({ ...q })),
    }
    const r = simulateRaidClaim(coin, 'q_post')
    expect(coin.crew.some((c) => c.handle === r.handle)).toBe(true)
    expect(r.signature).toBe('quest:q_post')
  })
})

describe('solscanTokenUrl', () => {
  it('builds token URLs', () => {
    expect(solscanTokenUrl(splitCoin.mint)).toContain('solscan.io/token/')
  })
})
