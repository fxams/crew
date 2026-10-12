import { describe, expect, it } from 'vitest'
import { sortLiveCoins, toLiveCoinRow, type LiveCoinRow } from './live-coins.js'
import type { ApiCoin } from './coins.js'

const base = (over: Partial<ApiCoin> & { mint: string; ticker: string }): ApiCoin => ({
  id: over.mint.slice(0, 8),
  mint: over.mint,
  name: over.name || over.ticker,
  ticker: over.ticker,
  vibe: '',
  mode: 'agent',
  crew: [],
  signature: '',
  launchedAt: over.launchedAt || 1,
  launcher: 'L',
  pumpUrl: `https://pump.fun/coin/${over.mint}`,
  platform: 'pumpfun',
})

describe('live coins board', () => {
  it('sorts by market cap desc and keeps unknown mcap last', () => {
    const rows: LiveCoinRow[] = [
      toLiveCoinRow(base({ mint: 'mintlow111111111111111111111111111111111', ticker: 'LOW', launchedAt: 3 }), {
        marketCapUsd: 1_000,
      }),
      toLiveCoinRow(base({ mint: 'minthigh11111111111111111111111111111111', ticker: 'HIGH', launchedAt: 1 }), {
        marketCapUsd: 50_000,
      }),
      toLiveCoinRow(base({ mint: 'mintnone11111111111111111111111111111111', ticker: 'NONE', launchedAt: 9 }), {}),
    ]
    expect(sortLiveCoins(rows).map((r) => r.ticker)).toEqual(['HIGH', 'LOW', 'NONE'])
  })

  it('uses real fields only — null mcap/change stay null (UI shows --)', () => {
    const row = toLiveCoinRow(
      base({ mint: 'So11111111111111111111111111111111111111112', ticker: 'HOOT', name: 'Night Owl' }),
      {},
    )
    expect(row.pageUrl).toBe('https://crewpay.dev/coin/So11111111111111111111111111111111111111112')
    expect(row.marketCapUsd).toBeNull()
    expect(row.priceChange24h).toBeNull()
    expect(JSON.stringify(row)).not.toMatch(/\$1\.1M/)
  })
})
