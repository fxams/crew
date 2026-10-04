import { describe, expect, it } from 'vitest'
import {
  buildScoreboard,
  deskStats,
  shareReceiptText,
  CREW_EDGES,
  LAUNCH_TEMPLATES,
} from './edges'
import type { CoinRecord, RemitRecord } from './types'

const remits: RemitRecord[] = [
  {
    id: '1',
    mint: 'm1',
    ticker: 'AA',
    handle: '@alice',
    wallet: '',
    amountSol: 0.02,
    mode: 'split',
    at: 1,
  },
  {
    id: '2',
    mint: 'm1',
    ticker: 'AA',
    handle: '@bob',
    wallet: '',
    amountSol: 0.01,
    mode: 'split',
    at: 2,
  },
  {
    id: '3',
    mint: 'm2',
    ticker: 'BB',
    handle: '@alice',
    wallet: '',
    amountSol: 0.03,
    mode: 'raid',
    at: 3,
  },
]

describe('buildScoreboard', () => {
  it('ranks humans by SOL paid', () => {
    const board = buildScoreboard(remits)
    expect(board[0].handle).toBe('@alice')
    expect(board[0].totalSol).toBeCloseTo(0.05)
    expect(board[0].tickers).toEqual(['AA', 'BB'])
    expect(board[1].handle).toBe('@bob')
  })
})

describe('deskStats', () => {
  it('tracks 0% platform cut and paid SOL', () => {
    const coins = [{}, {}] as CoinRecord[]
    const stats = deskStats(coins, remits)
    expect(stats.platformCut).toBe(0)
    expect(stats.paidSol).toBeCloseTo(0.06)
    expect(stats.coins).toBe(2)
  })
})

describe('shareReceiptText', () => {
  it('builds a CT-ready receipt', () => {
    const text = shareReceiptText({
      id: 'c',
      mint: 'mint',
      name: 'Test',
      ticker: 'TST',
      vibe: 'vibe',
      mode: 'split',
      crew: [
        { handle: '@a', wallet: '', share: 70 },
        { handle: '@b', wallet: '', share: 30 },
      ],
      signature: 'x',
      launchedAt: 1,
      launcher: 'launcher',
      pumpUrl: 'https://pump.fun/coin/mint',
    })
    expect(text).toContain('$TST crew locked on CREW')
    expect(text).toContain('@a 70%')
    expect(text).toContain('0% platform cut')
    expect(text).toContain('Humans get paid')
  })
})

describe('edges catalog', () => {
  it('ships competitive edges and templates', () => {
    expect(CREW_EDGES.length).toBeGreaterThanOrEqual(4)
    expect(LAUNCH_TEMPLATES.map((t) => t.id)).toEqual(['kol', 'dip', 'raid'])
  })
})
