import { SITE_URL } from './agent/discovery.js'
import { assertSafeHttpUrl } from './agent/safe-url.js'
import type { ApiCoin } from './coins.js'

export type PublicCoinMeta = {
  imageUrl?: string
  twitter?: string
  website?: string
  telegram?: string
  volumeUsd?: number
  holders?: number
  marketCapUsd?: number
  priceChange24h?: number
  graduated?: boolean
  graduatedVia?: string
  dexId?: string
}

export type PublicCoinPage = ApiCoin &
  PublicCoinMeta & {
    pageUrl: string
    chain: 'solana' | 'base' | 'base-sepolia'
    launchpadLabel: string
  }

const META_TTL_MS = 15 * 60_000
const metaCache = new Map<string, { at: number; meta: PublicCoinMeta }>()

const META_HOSTS = new Set([
  'frontend-api.pump.fun',
  'frontend-api-v3.pump.fun',
  'api.dexscreener.com',
])

export function coinPageUrl(mint: string): string {
  return `${SITE_URL}/coin/${mint}`
}

export function resetCoinMetaCache() {
  metaCache.clear()
}

function safeHttps(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  try {
    const u = assertSafeHttpUrl(raw.trim(), 'url')
    if (u.protocol !== 'https:') return undefined
    return u.toString()
  } catch {
    return undefined
  }
}

function normalizeTwitter(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const v = raw.trim()
  if (/^https?:\/\//i.test(v)) return safeHttps(v)
  const handle = v.replace(/^@/, '').replace(/^(x|twitter)\.com\//i, '').split(/[/?#]/)[0]
  if (!handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) return undefined
  return `https://x.com/${handle}`
}

function launchpadLabel(coin: ApiCoin): string {
  if (coin.platform === 'bags') return 'Bags.fm'
  if (coin.platform === 'zora') return 'Zora'
  return 'Pump.fun'
}

function chainFor(coin: ApiCoin): PublicCoinPage['chain'] {
  if (coin.platform === 'zora') {
    return /sepolia/i.test(coin.pumpUrl || '') ? 'base-sepolia' : 'base'
  }
  return 'solana'
}

async function fetchJson(url: string): Promise<unknown | null> {
  const parsed = new URL(url)
  if (!META_HOSTS.has(parsed.hostname.toLowerCase())) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 2500)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

function fromPumpPayload(data: unknown): PublicCoinMeta {
  if (!data || typeof data !== 'object') return {}
  const o = data as Record<string, unknown>
  const g = detectPumpGraduation(o)
  return {
    imageUrl: safeHttps(o.image_uri || o.imageUri || o.image),
    twitter: normalizeTwitter(o.twitter || o.twitter_url),
    website: safeHttps(o.website),
    telegram: safeHttps(o.telegram),
    graduated: g.graduated || undefined,
    graduatedVia: g.via || undefined,
  }
}

function detectPumpGraduation(o: Record<string, unknown>): { graduated: boolean; via: string | null } {
  if (o.complete === true || o.complete === 'true') return { graduated: true, via: 'pump-complete' }
  const ray = o.raydium_pool || o.raydiumPool
  if (typeof ray === 'string' && ray.trim()) return { graduated: true, via: 'raydium' }
  const swap = o.pump_swap || o.pumpSwap || o.pump_swap_pool
  if (typeof swap === 'string' && swap.trim()) return { graduated: true, via: 'pumpswap' }
  if (swap === true) return { graduated: true, via: 'pumpswap' }
  return { graduated: false, via: null }
}

function fromDexPayload(data: unknown): PublicCoinMeta {
  if (!data || typeof data !== 'object') return {}
  const o = data as Record<string, unknown>
  const pairs = Array.isArray(o.pairs) ? o.pairs : []
  const ranked = pairs
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
    .sort(
      (a, b) =>
        Number(b.marketCap || b.fdv || 0) - Number(a.marketCap || a.fdv || 0),
    )
  const first = ranked[0] || null
  const info =
    first && first.info && typeof first.info === 'object'
      ? (first.info as Record<string, unknown>)
      : null
  const socials = Array.isArray(info?.socials) ? (info?.socials as Record<string, unknown>[]) : []
  const twitter = socials.find((s) => String(s.type || '').toLowerCase() === 'twitter')
  const telegram = socials.find((s) => String(s.type || '').toLowerCase() === 'telegram')
  const websites = Array.isArray(info?.websites) ? (info?.websites as Record<string, unknown>[]) : []
  const vol = first?.volume && typeof first.volume === 'object' ? (first.volume as Record<string, unknown>) : null
  const volumeUsd = Number(vol?.h24)
  const mcap = Number(first?.marketCap ?? first?.fdv)
  const chg =
    first?.priceChange && typeof first.priceChange === 'object'
      ? Number((first.priceChange as Record<string, unknown>).h24)
      : NaN
  const dexId = first ? String(first.dexId || '').toLowerCase() : ''
  const graduatedDex =
    dexId === 'pumpswap' || dexId === 'pump-swap'
      ? 'pumpswap'
      : dexId === 'raydium'
        ? 'raydium'
        : null
  return {
    imageUrl: safeHttps(info?.imageUrl),
    twitter: normalizeTwitter(twitter?.url),
    website: safeHttps(websites[0]?.url),
    telegram: safeHttps(telegram?.url),
    volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : undefined,
    marketCapUsd: Number.isFinite(mcap) && mcap > 0 ? mcap : undefined,
    priceChange24h: Number.isFinite(chg) ? chg : undefined,
    graduated: graduatedDex ? true : undefined,
    graduatedVia: graduatedDex || undefined,
    dexId: dexId || undefined,
  }
}

/** Public metadata (image/socials) from pump.fun / DexScreener — no secrets. */
export async function enrichPublicCoinMeta(coin: {
  mint: string
  pumpUrl?: string
  platform?: string
}): Promise<PublicCoinMeta> {
  const cached = metaCache.get(coin.mint)
  if (cached && Date.now() - cached.at < META_TTL_MS) return cached.meta

  let meta: PublicCoinMeta = {}
  const pumpish = (coin.platform || 'pumpfun') !== 'zora'
  if (pumpish) {
    meta = fromPumpPayload(
      await fetchJson(`https://frontend-api-v3.pump.fun/coins/${encodeURIComponent(coin.mint)}`),
    )
  }
  const dex = fromDexPayload(
    await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(coin.mint)}`),
  )
  meta = {
    imageUrl: meta.imageUrl || dex.imageUrl,
    twitter: meta.twitter || dex.twitter,
    website: meta.website || dex.website,
    telegram: meta.telegram || dex.telegram,
    volumeUsd: meta.volumeUsd ?? dex.volumeUsd,
    marketCapUsd: meta.marketCapUsd ?? dex.marketCapUsd,
    priceChange24h: meta.priceChange24h ?? dex.priceChange24h,
    graduated: meta.graduated || dex.graduated,
    graduatedVia: meta.graduatedVia || dex.graduatedVia,
    dexId: dex.dexId,
  }

  const cleaned: PublicCoinMeta = {}
  if (meta.imageUrl) cleaned.imageUrl = meta.imageUrl
  if (meta.twitter) cleaned.twitter = meta.twitter
  if (meta.website) cleaned.website = meta.website
  if (meta.telegram) cleaned.telegram = meta.telegram
  if (meta.volumeUsd != null) cleaned.volumeUsd = meta.volumeUsd
  if (meta.holders != null) cleaned.holders = meta.holders
  if (meta.marketCapUsd != null) cleaned.marketCapUsd = meta.marketCapUsd
  if (meta.priceChange24h != null) cleaned.priceChange24h = meta.priceChange24h
  if (meta.graduated) cleaned.graduated = true
  if (meta.graduatedVia) cleaned.graduatedVia = meta.graduatedVia
  if (meta.dexId) cleaned.dexId = meta.dexId
  metaCache.set(coin.mint, { at: Date.now(), meta: cleaned })
  return cleaned
}

export function toPublicCoinPage(coin: ApiCoin, meta: PublicCoinMeta = {}): PublicCoinPage {
  return {
    ...coin,
    ...meta,
    pageUrl: coinPageUrl(coin.mint),
    chain: chainFor(coin),
    launchpadLabel: launchpadLabel(coin),
  }
}

/** Test helper: parse socials without network. */
export function normalizePublicCoinMeta(raw: {
  imageUrl?: unknown
  twitter?: unknown
  website?: unknown
  telegram?: unknown
}): PublicCoinMeta {
  const out: PublicCoinMeta = {}
  const image = safeHttps(raw.imageUrl)
  const twitter = normalizeTwitter(raw.twitter)
  const website = safeHttps(raw.website)
  const telegram = safeHttps(raw.telegram)
  if (image) out.imageUrl = image
  if (twitter) out.twitter = twitter
  if (website) out.website = website
  if (telegram) out.telegram = telegram
  return out
}
