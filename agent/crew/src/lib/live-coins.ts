import { inferLaunchPlatform, type LaunchPlatform } from './platforms'

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
  platform?: LaunchPlatform | string
  graduated?: boolean
}

export type LiveCoinSort = 'mcap' | 'change24h' | 'newest' | 'oldest'
export type LiveCoinFilter = 'all' | 'bonding' | 'graduated' | LaunchPlatform

export const DEFAULT_LIVE_COIN_SORT: LiveCoinSort = 'mcap'

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

function compareNullableDesc(
  a: number | null | undefined,
  b: number | null | undefined,
  launchedAtA: number,
  launchedAtB: number,
): number {
  if (a == null && b == null) return launchedAtB - launchedAtA
  if (a == null) return 1
  if (b == null) return -1
  return b - a || launchedAtB - launchedAtA
}

export function liveCoinVenue(row: LiveCoinRow): LaunchPlatform {
  return inferLaunchPlatform({
    platform: row.platform,
    pumpUrl: row.pumpUrl,
    mint: row.mint,
  })
}

export function liveCoinGraduated(row: LiveCoinRow): boolean {
  return row.graduated === true
}

export function searchLiveCoins(rows: LiveCoinRow[], query: string): LiveCoinRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row) => {
    return (
      row.name.toLowerCase().includes(q) ||
      row.ticker.toLowerCase().includes(q) ||
      row.mint.toLowerCase().includes(q)
    )
  })
}

export function filterLiveCoins(rows: LiveCoinRow[], filter: LiveCoinFilter): LiveCoinRow[] {
  if (filter === 'all') return rows
  if (filter === 'bonding') return rows.filter((row) => !liveCoinGraduated(row))
  if (filter === 'graduated') return rows.filter((row) => liveCoinGraduated(row))
  return rows.filter((row) => liveCoinVenue(row) === filter)
}

export function availableCoinVenues(rows: LiveCoinRow[]): LaunchPlatform[] {
  const seen = new Set<LaunchPlatform>()
  for (const row of rows) seen.add(liveCoinVenue(row))
  return (['pumpfun', 'bags', 'zora', 'clanker'] as const).filter((id) => seen.has(id))
}

export function sortLiveCoins(
  rows: LiveCoinRow[],
  sort: LiveCoinSort = DEFAULT_LIVE_COIN_SORT,
): LiveCoinRow[] {
  const copy = [...rows]
  if (sort === 'newest') return copy.sort((a, b) => b.launchedAt - a.launchedAt)
  if (sort === 'oldest') return copy.sort((a, b) => a.launchedAt - b.launchedAt)
  if (sort === 'change24h') {
    return copy.sort((a, b) =>
      compareNullableDesc(a.priceChange24h, b.priceChange24h, a.launchedAt, b.launchedAt),
    )
  }
  return copy.sort((a, b) =>
    compareNullableDesc(a.marketCapUsd, b.marketCapUsd, a.launchedAt, b.launchedAt),
  )
}

export function applyLiveCoinsBoard(
  rows: LiveCoinRow[],
  opts: { query?: string; sort?: LiveCoinSort; filter?: LiveCoinFilter } = {},
): LiveCoinRow[] {
  const searched = searchLiveCoins(rows, opts.query || '')
  const filtered = filterLiveCoins(searched, opts.filter || 'all')
  return sortLiveCoins(filtered, opts.sort || DEFAULT_LIVE_COIN_SORT)
}
