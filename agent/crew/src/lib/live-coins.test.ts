import { describe, expect, it } from 'vitest'
import { formatPctChange, formatUsdCompact, sortLiveCoins, type LiveCoinRow } from './live-coins'

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
})
