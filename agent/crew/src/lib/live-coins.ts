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
