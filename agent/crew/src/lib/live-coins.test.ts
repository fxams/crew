import { describe, expect, it } from 'vitest'
import {
  COINS_PAGE_SIZE,
  applyLiveCoinsBoard,
  availableCoinVenues,
  formatPctChange,
  formatUsdCompact,
  paginateRows,
  searchLiveCoins,
  sortLiveCoins,
  type LiveCoinRow,
} from './live-coins'

function row(over: Partial<LiveCoinRow> & { ticker: string }): LiveCoinRow {
  return {
    mint: over.mint || `${over.ticker}111111111111111111111111111111111111`,
    name: over.name || over.ticker,
    ticker: over.ticker,
    pageUrl: `/coin/${over.ticker}`,
    pumpUrl: over.pumpUrl || 'https://pump.fun/coin/x',
    launchedAt: over.launchedAt ?? 1,
    marketCapUsd: over.marketCapUsd ?? null,
    priceChange24h: over.priceChange24h ?? null,
    imageUrl: over.imageUrl,
    platform: over.platform,
    graduated: over.graduated,
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

  it('sorts by 24h change, newest, and oldest', () => {
    const rows = [
      row({ ticker: 'OLD', launchedAt: 1, priceChange24h: 2, marketCapUsd: 10 }),
      row({ ticker: 'NEW', launchedAt: 9, priceChange24h: -1, marketCapUsd: 20 }),
      row({ ticker: 'HOT', launchedAt: 5, priceChange24h: 40, marketCapUsd: 5 }),
      row({ ticker: 'UNK', launchedAt: 8, priceChange24h: null, marketCapUsd: 99 }),
    ]
    expect(sortLiveCoins(rows, 'change24h').map((r) => r.ticker)).toEqual(['HOT', 'OLD', 'NEW', 'UNK'])
    expect(sortLiveCoins(rows, 'newest').map((r) => r.ticker)).toEqual(['NEW', 'UNK', 'HOT', 'OLD'])
    expect(sortLiveCoins(rows, 'oldest').map((r) => r.ticker)).toEqual(['OLD', 'HOT', 'UNK', 'NEW'])
  })

  it('searches name, ticker, and mint, then filters and pages', () => {
    const rows = [
      row({
        ticker: 'OWL',
        name: 'Night Owl',
        mint: 'mintowl111111111111111111111111111111111',
        marketCapUsd: 50,
        graduated: false,
        launchedAt: 1,
      }),
      row({
        ticker: 'BAG',
        name: 'Bag Coin',
        mint: 'mintbag111111111111111111111111111111111',
        marketCapUsd: 500,
        platform: 'bags',
        pumpUrl: 'https://bags.fm/mintbag111111111111111111111111111111111',
        graduated: true,
        launchedAt: 2,
      }),
      row({
        ticker: 'ZOR',
        name: 'Zora Coin',
        mint: '0x1111111111111111111111111111111111111111',
        marketCapUsd: 80,
        platform: 'zora',
        pumpUrl: 'https://zora.co/coin/base:0x1111111111111111111111111111111111111111',
        graduated: false,
        launchedAt: 3,
      }),
    ]
    expect(searchLiveCoins(rows, 'owl').map((r) => r.ticker)).toEqual(['OWL'])
    expect(searchLiveCoins(rows, 'BAG').map((r) => r.ticker)).toEqual(['BAG'])
    expect(searchLiveCoins(rows, 'mintowl').map((r) => r.ticker)).toEqual(['OWL'])
    expect(availableCoinVenues(rows)).toEqual(['pumpfun', 'bags', 'zora'])

    const graduated = applyLiveCoinsBoard(rows, { filter: 'graduated' })
    expect(graduated.map((r) => r.ticker)).toEqual(['BAG'])
    const bonding = applyLiveCoinsBoard(rows, { filter: 'bonding', sort: 'mcap' })
    expect(bonding.map((r) => r.ticker)).toEqual(['ZOR', 'OWL'])
    const bags = applyLiveCoinsBoard(rows, { filter: 'bags' })
    expect(bags.map((r) => r.ticker)).toEqual(['BAG'])

    const many = Array.from({ length: 12 }, (_, i) =>
      row({ ticker: `T${i}`, marketCapUsd: 100 - i, launchedAt: i }),
    )
    const filtered = applyLiveCoinsBoard(many, { query: 'T1' })
    expect(filtered.map((r) => r.ticker)).toEqual(['T1', 'T10', 'T11'])
    expect(paginateRows(filtered, 1, 10).slice).toHaveLength(3)
    expect(paginateRows(applyLiveCoinsBoard(many, { sort: 'mcap' }), 2, 10).slice.map((r) => r.ticker)).toEqual([
      'T10',
      'T11',
    ])
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
