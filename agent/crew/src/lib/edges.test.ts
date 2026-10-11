import { describe, expect, it } from 'vitest'
import {
  buildScoreboard,
  deskStats,
  shareReceiptText,
  CREW_EDGES,
  LAUNCH_TEMPLATES,
  buildDeskPulse,
  isKolRemit,
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

  it('ignores non-KOL roles and null roles when attributed', () => {
    const sample: RemitRecord[] = [
      {
        id: 'p',
        mint: 'mX',
        ticker: 'PLAT',
        handle: '@crew-buyback',
        wallet: 'W_TREASURY',
        amountSol: 1.0,
        mode: 'split',
        at: 1,
        role: 'platform',
      },
      {
        id: 'd',
        mint: 'mX',
        ticker: 'DESK',
        handle: '@CrewAgent',
        wallet: 'W_LAUNCHER',
        amountSol: 1.0,
        mode: 'agent',
        at: 2,
        role: 'desk',
      },
      {
        id: 'u',
        mint: 'mX',
        ticker: 'UNK',
        handle: '@unknown',
        wallet: 'W_U',
        amountSol: 0.7,
        mode: 'split',
        at: 3,
        role: null,
      },
      {
        id: 'c',
        mint: 'mX',
        ticker: 'CREW',
        handle: '@alice',
        wallet: 'W_A',
        amountSol: 0.5,
        mode: 'split',
        at: 4,
        role: 'crew',
      },
    ]
    const board = buildScoreboard(sample)
    expect(board.length).toBe(1)
    expect(board[0].handle).toBe('@alice')
    expect(board[0].totalSol).toBeCloseTo(0.5)
  })
})

describe('isKolRemit', () => {
  const coin: CoinRecord = {
    id: 'c1',
    mint: 'm1',
    name: 'AAA',
    ticker: 'AAA',
    vibe: '',
    mode: 'agent',
    crew: [{ handle: '@alice', wallet: 'W_A', share: 100 }],
    signature: 'x',
    feeShareSignature: 'x',
    launchedAt: 1,
    launcher: 'W_L',
    pumpUrl: 'https://pump.fun/coin/m1',
    agent: { name: 'GrokBot', objective: 'Test', model: 'api' },
  }
  it('excludes launcher desk rows (e.g., @GrokBot) from KOL remits', () => {
    const r: RemitRecord = {
      id: 'r1',
      mint: coin.mint,
      ticker: coin.ticker,
      handle: '@GrokBot',
      wallet: 'W_L',
      amountSol: 0.2,
      mode: 'agent',
      at: Date.now(),
      signature: 'sig',
      source: 'chain',
    }
    expect(isKolRemit(r, coin)).toBe(false)
  })
  it('excludes treasury rows from KOL remits', () => {
    ;(process as any).env.VITE_CREW_BUYBACK_WALLET = 'W_T'
    const r: RemitRecord = {
      id: 'r2',
      mint: coin.mint,
      ticker: coin.ticker,
      handle: '@crew-buyback',
      wallet: 'W_T',
      amountSol: 0.3,
      mode: 'split',
      at: Date.now(),
      signature: 'sig2',
      source: 'chain',
    }
    expect(isKolRemit(r, coin)).toBe(false)
  })
})

describe('buildDeskPulse', () => {
  it('includes only crew/KOL remits in the pulse', () => {
    const coins = [
      {
        id: 'c1',
        mint: 'm1',
        name: 'AAA',
        ticker: 'AAA',
        vibe: '',
        mode: 'split',
        crew: [],
        signature: 'x',
        launchedAt: 1,
        launcher: 'L',
        pumpUrl: 'https://pump.fun/coin/m1',
      },
    ] as unknown as CoinRecord[]
    const remits: RemitRecord[] = [
      { id: 'p', mint: 'm1', ticker: 'AAA', handle: '@crew-buyback', wallet: 'T', amountSol: 1, mode: 'split', at: 1, role: 'platform' },
      { id: 'd', mint: 'm1', ticker: 'AAA', handle: '@CrewAgent', wallet: 'L', amountSol: 2, mode: 'agent', at: 2, role: 'desk' },
      { id: 'c', mint: 'm1', ticker: 'AAA', handle: '@alice', wallet: 'A', amountSol: 0.25, mode: 'split', at: 3, role: 'crew' },
    ]
    const pulse = buildDeskPulse(coins, remits, Date.now())
    const remitItems = pulse.filter((p) => p.kind === 'remit' || p.kind === 'lock')
    expect(remitItems.some((i) => i.title.includes('@alice'))).toBe(true)
    expect(remitItems.some((i) => i.title.includes('@CrewAgent'))).toBe(false)
    expect(remitItems.some((i) => i.title.includes('@crew-buyback'))).toBe(false)
  })
})

describe('deskStats', () => {
  it('tracks 25% CrewPay treasury cut and paid SOL', () => {
    const coins = [{}, {}] as CoinRecord[]
    const stats = deskStats(coins, remits)
    expect(stats.platformCut).toBe(25)
    expect(stats.paidSol).toBeCloseTo(0.06)
    expect(stats.coins).toBe(2)
  })

  it('sums only KOL remits when roles are present', () => {
    const coins = [{}] as CoinRecord[]
    const sample: RemitRecord[] = [
      { id: '1', mint: 'm', ticker: 'X', handle: '@crew-buyback', wallet: 'T', amountSol: 1, mode: 'split', at: 1, role: 'platform' },
      { id: '2', mint: 'm', ticker: 'X', handle: '@CrewAgent', wallet: 'L', amountSol: 2, mode: 'agent', at: 2, role: 'desk' },
      { id: '3', mint: 'm', ticker: 'X', handle: '@alice', wallet: 'A', amountSol: 0.25, mode: 'split', at: 3, role: 'crew' },
      { id: '4', mint: 'm', ticker: 'X', handle: '@bob', wallet: 'B', amountSol: 0.5, mode: 'split', at: 4, role: null },
    ]
    const stats = deskStats(coins, sample)
    expect(stats.humanRemits).toBe(1)
    expect(stats.paidSol).toBeCloseTo(0.25)
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
    expect(text).toContain('25% CrewPay treasury')
    expect(text).toContain('Humans get paid')
  })
})

describe('edges catalog', () => {
  it('ships competitive edges and templates', () => {
    expect(CREW_EDGES.length).toBeGreaterThanOrEqual(4)
    expect(LAUNCH_TEMPLATES.map((t) => t.id)).toEqual(['agent', 'kol', 'dip'])
    expect(LAUNCH_TEMPLATES.find((t) => t.id === 'agent')?.draft.mode).toBe('agent')
    expect(LAUNCH_TEMPLATES.some((t) => t.id === 'raid')).toBe(false)
  })
})
