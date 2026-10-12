import { describe, expect, it } from 'vitest'
import {
  COINS_PAGE_SIZE,
  formatPctChange,
  formatUsdCompact,
  paginateRows,
  sortLiveCoins,
  type LiveCoinRow,
} from './live-coins'

function row(over: Partial<LiveCoinRow> & { ticker: string }): LiveCoinRow {
  return {
    mint: over.mint || `${over.ticker}111111111111111111111111111111111111`,
    name: over.name || over.ticker,
    ticker: over.ticker,
    pageUrl: `/coin/${over.ticker}`,
    pumpUrl: 'https://pump.fun/coin/x',
    launchedAt: over.launchedAt ?? 1,
    marketCapUsd: over.marketCapUsd ?? null,
    priceChange24h: over.priceChange24h ?? null,
    imageUrl: over.imageUrl,
  }
}

describe('live coins display', () => {
  it('shows -- for unknown mcap and change', () => {
    expect(formatUsdCompact(null)).toBe('--')
    expect(formatUsdCompact(undefined)).toBe('--')
    expect(formatPctChange(null)).toBe('--')
    expect(formatUsdCompact(1_100_000)).toBe('$1.1M')
    expect(formatPctChange(10.3)).toBe('+10.3%')
    expect(formatPctChange(-3)).toBe('-3.0%')
  })

  it('sorts by market cap with unknowns last', () => {
    const sorted = sortLiveCoins([
      row({ ticker: 'B', marketCapUsd: 100, launchedAt: 2 }),
      row({ ticker: 'A', marketCapUsd: 500, launchedAt: 1 }),
      row({ ticker: 'Z', marketCapUsd: null, launchedAt: 9 }),
    ])
    expect(sorted.map((r) => r.ticker)).toEqual(['A', 'B', 'Z'])
  })

  it('pages coins 10 at a time and clamps the page', () => {
    const rows = Array.from({ length: 23 }, (_, i) => row({ ticker: `T${i}` }))
    expect(COINS_PAGE_SIZE).toBe(10)
    expect(paginateRows(rows, 1, 10).slice).toHaveLength(10)
    expect(paginateRows(rows, 3, 10).slice.map((r) => r.ticker)).toEqual(['T20', 'T21', 'T22'])
    expect(paginateRows(rows, 99, 10).page).toBe(3)
    expect(paginateRows(rows.slice(0, 10), 1, 10).pages).toBe(1)
    expect(paginateRows(rows.slice(0, 11), 1, 10).pages).toBe(2)
  })
})
