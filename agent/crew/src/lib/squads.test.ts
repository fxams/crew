import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SQUADS_CHARTS_PATH,
  SQUADS_COLLECTING,
  SQUADS_COPY_PATH,
  SQUADS_DASHBOARD_PATH,
  SQUADS_DISCLAIMER_FALLBACK,
  SQUADS_DISPUTE_CONTACT,
  SQUADS_LIVE_COPY_NOTE,
  SQUADS_METHODOLOGY_PATH,
  SQUADS_PRESTART_BADGE,
  SQUADS_TOKEN_CHART_PATH,
  scaleSquadCandles,
  snapSquadMarkers,
  snapUnixToCandle,
  squadsChartsUrl,
  squadsCopyUrl,
  squadsDashboardUrl,
  squadsTokenChartUrl,
  isCapitalFlowsCollecting,
  isMomentumCollecting,
  isSquadsFeedStale,
  isSquadsPreStart,
  isWalletAgeCollecting,
  paperCopyBlocked,
  paperCopyScoreAfterFees,
  publicMemberLabel,
  readLocalKillSwitch,
  resolveSquadLabel,
  sharedFunders,
  squadNameById,
  squadsDisclaimer,
  squadsDisputeContact,
  squadsMethodologyUrl,
  writeLocalKillSwitch,
  type SquadRow,
} from './squads'

const here = dirname(fileURLToPath(import.meta.url))

describe('squads wording', () => {
  it('never uses cheat / cheating / cheat rank in squads sources', () => {
    const files = [
      join(here, 'squads.ts'),
      join(here, '../components/SquadsPage.tsx'),
      join(here, '../components/SquadActivityChart.tsx'),
      join(here, '../components/SquadsMethodologyPage.tsx'),
    ]
    const banned = /\bcheat(ing|s|ed)?\b|\bcheat rank\b|\bpump and dump\b|\bmanipulation\b/i
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(banned)
    }
  })

  it('renders contest clocks through formatUtc helpers', () => {
    const src = readFileSync(join(here, '../components/SquadsPage.tsx'), 'utf8')
    expect(src).toContain('formatUtc')
    expect(src).toContain('formatUtcCountdown')
  })

  it('fetches only the CrewPay squads proxy and hosts methodology locally', () => {
    const src = [
      readFileSync(join(here, 'squads.ts'), 'utf8'),
      readFileSync(join(here, '../components/SquadsPage.tsx'), 'utf8'),
      readFileSync(join(here, '../components/SquadActivityChart.tsx'), 'utf8'),
      readFileSync(join(here, '../components/SquadsMethodologyPage.tsx'), 'utf8'),
    ].join('\n')
    const needle = ['deep', 'counter', 'feit'].join('')
    expect(src.toLowerCase()).not.toContain(needle)
    expect(SQUADS_DASHBOARD_PATH).toBe('/api/squads/dashboard')
    expect(SQUADS_COPY_PATH).toBe('/api/squads/copy')
    expect(SQUADS_CHARTS_PATH).toBe('/api/squads/charts')
    expect(SQUADS_TOKEN_CHART_PATH).toBe('/api/squads/token-chart')
    expect(squadsDashboardUrl()).toMatch(/\/api\/squads\/dashboard$/)
    expect(squadsCopyUrl('alpha-1')).toContain('/api/squads/copy?squad=alpha-1')
    expect(squadsChartsUrl()).toMatch(/\/api\/squads\/charts$/)
    expect(squadsTokenChartUrl('alpha-1', '4ugDhHJ8XDXAeABmrNmGffFaLbJb9BkPyiFGVSV9ocwo')).toContain(
      '/api/squads/token-chart?squad=alpha-1&mint=4ugDhHJ8XDXAeABmrNmGffFaLbJb9BkPyiFGVSV9ocwo',
    )
    const chartSrc = readFileSync(join(here, '../components/SquadActivityChart.tsx'), 'utf8')
    expect(chartSrc).toContain('fetchSquadsCharts')
    expect(chartSrc).toContain('fetchSquadsTokenChart')
    expect(chartSrc).not.toMatch(/https?:\/\//)
    expect(squadsMethodologyUrl()).toBe('/squads/methodology')
    expect(src).toContain('SQUADS_METHODOLOGY_PATH')
    expect(src).toContain('crewpay@mail.grokbot.com')
  })

  it('does not build, sign, or send swaps', () => {
    const src = readFileSync(join(here, '../components/SquadsPage.tsx'), 'utf8')
    expect(src).not.toMatch(/signTransaction|sendTransaction|jupiter|VersionedTransaction/i)
    expect(src).not.toMatch(/buildSwap|swapTransaction|jupiter swap/i)
    expect(src).toContain('SQUADS_LIVE_COPY_NOTE')
    expect(src).toContain('disabled')
  })

  it('uses the required disclaimer fallback and dispute contact', () => {
    expect(squadsDisclaimer({})).toBe(SQUADS_DISCLAIMER_FALLBACK)
    expect(squadsDisclaimer({ disclaimer: '  ' })).toBe(SQUADS_DISCLAIMER_FALLBACK)
    expect(squadsMethodologyUrl()).toBe(SQUADS_METHODOLOGY_PATH)
    expect(squadsDisputeContact()).toBe(SQUADS_DISPUTE_CONTACT)
    expect(SQUADS_DISPUTE_CONTACT).toBe('crewpay@mail.grokbot.com')
    expect(SQUADS_PRESTART_BADGE).toBe('pre-start, not contest PnL')
    expect(SQUADS_LIVE_COPY_NOTE).toBe('Live copy coming later')
    const methodSrc = readFileSync(join(here, '../components/SquadsMethodologyPage.tsx'), 'utf8')
    expect(methodSrc).toContain('Anomaly score')
    expect(methodSrc).toContain('SQUADS_DISCLAIMER_FALLBACK')
    expect(methodSrc).toContain('SQUADS_DISPUTE_CONTACT')
  })
})

describe('squads collecting data', () => {
  it('treats empty momentum / wallet age / capital flows as collecting', () => {
    expect(isMomentumCollecting(null)).toBe(true)
    expect(
      isMomentumCollecting({
        '1h': { pnl_change_usd: null, rank_change: null, baseline: null },
        '6h': { pnl_change_usd: null, rank_change: null, baseline: null },
        '24h': { pnl_change_usd: null, rank_change: null, baseline: null },
      }),
    ).toBe(true)
    expect(
      isMomentumCollecting({
        '1h': { pnl_change_usd: 12, rank_change: 1, baseline: 0 },
        '6h': null,
        '24h': null,
      }),
    ).toBe(false)
    expect(isWalletAgeCollecting({ traced: 0, fresh_lt_14d: [], wallets: [] })).toBe(true)
    expect(isWalletAgeCollecting({ traced: 2, wallets: [{ wallet: 'Abcdefghijk' }] })).toBe(false)
    expect(isCapitalFlowsCollecting({ wallets_sampled: 0, wallets_total: 9 })).toBe(true)
    expect(isCapitalFlowsCollecting({ wallets_sampled: 3, wallets_total: 9 })).toBe(false)
    expect(SQUADS_COLLECTING).toBe('collecting data')
  })
})

describe('squads paper copy', () => {
  it('disables copy when paper, mainnet off, or kill switch', () => {
    expect(paperCopyBlocked({ mode: 'paper', mainnet_available: false })).toBe(true)
    expect(paperCopyBlocked({ mode: 'mainnet', mainnet_available: true })).toBe(true)
    expect(paperCopyBlocked({ mode: 'mainnet', mainnet_available: true, localKill: true })).toBe(true)
    expect(paperCopyScoreAfterFees({ realized_usd: 10, open_mtm_usd: -4 })).toBe(6)
    expect(paperCopyScoreAfterFees({ pnl_usd: 70.15, open_mtm_usd: -88.01 })).toBeCloseTo(-17.86)
  })

  it('persists a local kill switch', () => {
    const mem = new Map<string, string>()
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    }
    expect(readLocalKillSwitch(storage)).toBe(false)
    writeLocalKillSwitch(true, storage)
    expect(readLocalKillSwitch(storage)).toBe(true)
    writeLocalKillSwitch(false, storage)
    expect(readLocalKillSwitch(storage)).toBe(false)
  })
})

describe('squads privacy + helpers', () => {
  it('labels members with username, X handle, or wallet only', () => {
    expect(publicMemberLabel({ username: 'The__Solstice', wallet: '4ugDhHJ8XDXAeABmrNmGffFaLbJb9BkPyiFGVSV9ocwo' })).toBe(
      'The__Solstice',
    )
    expect(publicMemberLabel({ x_handle: '@woof', wallet: '4ugDhHJ8XDXAeABmrNmGffFaLbJb9BkPyiFGVSV9ocwo' })).toBe('woof')
    expect(publicMemberLabel({ wallet: '4ugDhHJ8XDXAeABmrNmGffFaLbJb9BkPyiFGVSV9ocwo' })).toBe('4ugD…ocwo')
  })

  it('maps squad ids to public names', () => {
    const squads: SquadRow[] = [
      { id: 'aaa', name: 'Alpha' },
      { id: 'bbb', name: 'Beta' },
    ]
    const names = squadNameById(squads)
    expect(resolveSquadLabel('aaa', names)).toBe('Alpha')
    expect(sharedFunders(squads)).toEqual([])
  })

  it('detects pre-start and stale feeds', () => {
    expect(isSquadsPreStart('pre-start')).toBe(true)
    expect(isSquadsPreStart('live')).toBe(false)
    expect(isSquadsFeedStale('2026-10-23T18:00:00Z', Date.parse('2026-10-23T18:10:00Z'))).toBe(false)
    expect(isSquadsFeedStale('2026-10-23T18:00:00Z', Date.parse('2026-10-23T18:40:00Z'))).toBe(true)
  })
})

describe('squads activity candles', () => {
  it('snaps markers down to candle time and scales market cap', () => {
    const times = [1_761_000_000, 1_761_000_300, 1_761_000_600]
    expect(snapUnixToCandle(1_761_000_450, times)).toBe(1_761_000_300)
    expect(snapUnixToCandle(1_760_999_000, times)).toBe(1_761_000_000)
    const candles = scaleSquadCandles(
      [
        [1_761_000_000, 1, 2, 0.5, 1.5, 10],
        [1_761_000_300, 1.5, 2.5, 1.2, 2, 4],
      ],
      100,
      'mcap',
    )
    expect(candles[0]).toMatchObject({ time: 1_761_000_000, open: 100, high: 200, low: 50, close: 150 })
    const marks = snapSquadMarkers(
      [
        { t: 1_761_000_410, type: 'buy', username: 'owl', sol: 2, price: 1.6, venue: 'pump.fun' },
        { ts: '2025-10-21T00:05:10Z', type: 'launch', x_handle: 'owl' },
      ],
      times,
    )
    expect(marks[0].time).toBe(1_761_000_300)
    expect(marks[0].type).toBe('buy')
  })
})
