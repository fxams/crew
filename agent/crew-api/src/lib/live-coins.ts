import type { ApiCoin } from './coins.js'
import { listCoins } from './coins.js'
import { coinPageUrl, enrichPublicCoinMetas, type PublicCoinMeta } from './coin-page.js'
import { recordGraduationIfNew } from './graduation.js'

export type LiveCoinRow = {
  mint: string
  name: string
  ticker: string
  imageUrl?: string
  pageUrl: string
  pumpUrl: string
  launchedAt: number
  marketCapUsd: number | null
  priceChange24h: number | null
}

export function sortLiveCoins(rows: LiveCoinRow[]): LiveCoinRow[] {
  return [...rows].sort((a, b) => {
    const am = a.marketCapUsd
    const bm = b.marketCapUsd
    if (am == null && bm == null) return b.launchedAt - a.launchedAt
    if (am == null) return 1
    if (bm == null) return -1
    return bm - am
  })
}

export function toLiveCoinRow(coin: ApiCoin, meta: PublicCoinMeta = {}): LiveCoinRow {
  return {
    mint: coin.mint,
    name: coin.name,
    ticker: coin.ticker,
    imageUrl: meta.imageUrl,
    pageUrl: coinPageUrl(coin.mint),
    pumpUrl: coin.pumpUrl,
    launchedAt: coin.launchedAt,
    marketCapUsd: meta.marketCapUsd ?? null,
    priceChange24h: meta.priceChange24h ?? null,
  }
}

export function takeLiveCoins(rows: LiveCoinRow[], limit: number): LiveCoinRow[] {
  const take = Math.min(100, Math.max(1, Math.floor(Number(limit)) || 40))
  return sortLiveCoins(rows).slice(0, take)
}

export async function listLiveCoins(limit = 40): Promise<LiveCoinRow[]> {
  // Load a pool, quote+sort by market cap, then slice. Home asks for 5.
  const coins = await listCoins(100)
  const metas = await enrichPublicCoinMetas(coins).catch(() => new Map<string, PublicCoinMeta>())
  const rows: LiveCoinRow[] = []
  for (const coin of coins) {
    const meta = metas.get(coin.mint) || {}
    if (meta.graduated && !coin.graduatedAt) {
      await recordGraduationIfNew(coin, {
        graduated: true,
        via: meta.graduatedVia || 'observed',
      }).catch(() => null)
    }
    rows.push(toLiveCoinRow(coin, meta))
  }
  return takeLiveCoins(rows, limit)
}
