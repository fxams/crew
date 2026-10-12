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

/** Unknown quotes stay '--' — never invent a market cap. */
export function formatUsdCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '--'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  if (abs >= 1) return `$${n.toFixed(0)}`
  return '$0'
}

export function formatPctChange(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '--'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

export const COINS_PAGE_SIZE = 10

export function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { page: number; pages: number; slice: T[] } {
  const size = Math.max(1, Math.floor(pageSize) || 1)
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const safe = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  const start = (safe - 1) * size
  return { page: safe, pages, slice: rows.slice(start, start + size) }
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
