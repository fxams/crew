import { SITE_URL } from './agent/discovery.js'
import { OnlinePumpSdk } from './agent/pump.js'
import { assertSafeHttpUrl } from './agent/safe-url.js'
import { getConnection } from './agent/send.js'
import {
  clankerNetwork,
  explorerTokenUrl,
  inferLaunchPlatformFromCoin,
  tradeUrlForPlatform,
  type LaunchPlatform,
} from './agent/platforms.js'
import { isEvmAddress } from './agent/evm-address.js'
import type { ApiCoin } from './coins.js'
import { getFxRates } from './fx.js'

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
    /** Same as pageUrl — crewpay.dev/coin/<mint>. */
    coinUrl: string
    /** Where to trade (Pump, Zora, Clanker mainnet, etc.). */
    tradeUrl: string
    /** Block explorer token page (Solscan / Basescan). */
    explorerUrl: string
    chain: 'solana' | 'base' | 'base-sepolia'
    launchpadLabel: string
  }

/** Quote cache ~1–2 min. Images/socials ride along so the board stays coherent. */
export const COIN_META_TTL_MS = 90_000
export const DEX_TOKEN_BATCH = 30
const PUMP_SUPPLY = 1_000_000_000
const PUMP_DECIMALS = 6

const metaCache = new Map<string, { at: number; meta: PublicCoinMeta }>()

const META_HOSTS = new Set([
  'frontend-api.pump.fun',
  'frontend-api-v3.pump.fun',
  'api.dexscreener.com',
  'lite-api.jup.ag',
])

type FetchJson = (url: string) => Promise<unknown | null>
let fetchJsonImpl: FetchJson = defaultFetchJson

export function setCoinMetaFetch(fn: FetchJson | null) {
  fetchJsonImpl = fn || defaultFetchJson
}

export type PumpCurveSnapshot = {
  virtualQuoteReserves: number
  virtualTokenReserves: number
  tokenTotalSupply: number
  complete?: boolean
}

type PumpCurveFetch = (mint: string) => Promise<PumpCurveSnapshot | null>
let pumpCurveFetchImpl: PumpCurveFetch = defaultPumpCurveFetch

export function setPumpCurveFetch(fn: PumpCurveFetch | null) {
  pumpCurveFetchImpl = fn || defaultPumpCurveFetch
}

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

function launchPlatform(coin: ApiCoin): LaunchPlatform {
  return (
    coin.platform ||
    inferLaunchPlatformFromCoin({ pumpUrl: coin.pumpUrl, mint: coin.mint, platform: coin.platform })
  )
}

function launchpadLabel(coin: ApiCoin): string {
  const platform = launchPlatform(coin)
  if (platform === 'bags') return 'Bags.fm'
  if (platform === 'zora') return 'Zora'
  if (platform === 'clanker') return 'Clanker'
  return 'Pump.fun'
}

function chainFor(coin: ApiCoin): PublicCoinPage['chain'] {
  const platform = launchPlatform(coin)
  const url = (coin.pumpUrl || '').toLowerCase()
  if (platform === 'zora' || platform === 'clanker') {
    if (url.includes('sepolia') || url.includes('base-sepolia')) return 'base-sepolia'
    if (platform === 'clanker' && clankerNetwork() === 'base-sepolia' && isEvmAddress(coin.mint)) {
      return 'base-sepolia'
    }
    return 'base'
  }
  return 'solana'
}

/** Public trade / explorer / crew page links for board + API consumers. */
export function publicCoinLinks(coin: ApiCoin): {
  coinUrl: string
  tradeUrl: string
  explorerUrl: string
} {
  const platform = launchPlatform(coin)
  const coinUrl = coinPageUrl(coin.mint)
  let tradeUrl = tradeUrlForPlatform(platform, coin.mint)
  if (platform === 'clanker' && clankerNetwork() !== 'base') {
    tradeUrl = coinUrl
  }
  const explorerUrl = explorerTokenUrl(platform, coin.mint)
  return { coinUrl, tradeUrl, explorerUrl }
}

async function defaultFetchJson(url: string): Promise<unknown | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (!META_HOSTS.has(parsed.hostname.toLowerCase())) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 4_000)
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

function fetchJson(url: string): Promise<unknown | null> {
  return fetchJsonImpl(url)
}

export function dexChainId(coin: { platform?: string; pumpUrl?: string }): string {
  if (coin.platform === 'zora') return 'base'
  return 'solana'
}

export function chunkMints(mints: string[], size = DEX_TOKEN_BATCH): string[][] {
  const out: string[][] = []
  const n = Math.max(1, size)
  for (let i = 0; i < mints.length; i += n) out.push(mints.slice(i, i + n))
  return out
}

export function dexTokensV1Url(chainId: string, mints: string[]): string {
  return `https://api.dexscreener.com/tokens/v1/${encodeURIComponent(chainId)}/${mints
    .map((m) => encodeURIComponent(m))
    .join(',')}`
}

function tokenMatches(addr: unknown, mint: string): boolean {
  if (typeof addr !== 'string' || !addr) return false
  if (addr === mint) return true
  if (mint.startsWith('0x') || addr.startsWith('0x')) return addr.toLowerCase() === mint.toLowerCase()
  return false
}

function asPairs(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
  }
  if (data && typeof data === 'object') {
    const pairs = (data as { pairs?: unknown }).pairs
    if (Array.isArray(pairs)) {
      return pairs.filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
    }
  }
  return []
}

function pairTokenAddress(p: Record<string, unknown>, key: 'baseToken' | 'quoteToken'): string {
  const tok = p[key]
  if (!tok || typeof tok !== 'object') return ''
  const addr = (tok as { address?: unknown }).address
  return typeof addr === 'string' ? addr : ''
}

function pairMatchesMint(p: Record<string, unknown>, mint: string): boolean {
  return tokenMatches(pairTokenAddress(p, 'baseToken'), mint) || tokenMatches(pairTokenAddress(p, 'quoteToken'), mint)
}

function pairMcap(p: Record<string, unknown>): number {
  const mcap = Number(p.marketCap ?? p.fdv)
  return Number.isFinite(mcap) && mcap > 0 ? mcap : 0
}

function socialHandle(socials: Record<string, unknown>[], kind: 'twitter' | 'telegram'): string | undefined {
  const hit = socials.find((s) => {
    const type = String(s.type || s.platform || '').toLowerCase()
    return type === kind || (kind === 'twitter' && (type === 'x' || type === 'twitter'))
  })
  if (!hit) return undefined
  if (typeof hit.url === 'string') return hit.url
  if (typeof hit.handle === 'string') return hit.handle
  return undefined
}

function fromDexPairs(pairs: Record<string, unknown>[]): PublicCoinMeta {
  const ranked = [...pairs].sort((a, b) => pairMcap(b) - pairMcap(a))
  const first = ranked[0] || null
  if (!first) return {}
  const info =
    first.info && typeof first.info === 'object' ? (first.info as Record<string, unknown>) : null
  const socials = Array.isArray(info?.socials) ? (info?.socials as Record<string, unknown>[]) : []
  const websites = Array.isArray(info?.websites) ? (info?.websites as Record<string, unknown>[]) : []
  const vol = first.volume && typeof first.volume === 'object' ? (first.volume as Record<string, unknown>) : null
  const volumeUsd = Number(vol?.h24)
  const chg =
    first.priceChange && typeof first.priceChange === 'object'
      ? Number((first.priceChange as Record<string, unknown>).h24)
      : NaN
  const dexId = String(first.dexId || '').toLowerCase()
  const graduatedDex =
    dexId === 'pumpswap' || dexId === 'pump-swap'
      ? 'pumpswap'
      : dexId === 'raydium'
        ? 'raydium'
        : null
  return cleanMeta({
    imageUrl: safeHttps(info?.imageUrl),
    twitter: normalizeTwitter(socialHandle(socials, 'twitter')),
    website: safeHttps(websites[0]?.url),
    telegram: safeHttps(socialHandle(socials, 'telegram')),
    volumeUsd: Number.isFinite(volumeUsd) ? volumeUsd : undefined,
    marketCapUsd: pairMcap(first) || undefined,
    priceChange24h: Number.isFinite(chg) ? chg : undefined,
    graduated: graduatedDex ? true : undefined,
    graduatedVia: graduatedDex || undefined,
    dexId: dexId || undefined,
  })
}

/** Parse Dexscreener `/tokens/v1/{chain}/{mints}` (array) or legacy `{ pairs }`. */
export function parseDexTokenQuotes(data: unknown, mint?: string): PublicCoinMeta {
  let pairs = asPairs(data)
  if (mint) pairs = pairs.filter((p) => pairMatchesMint(p, mint))
  return fromDexPairs(pairs)
}

export function indexDexQuotes(data: unknown): Map<string, PublicCoinMeta> {
  const byMint = new Map<string, Record<string, unknown>[]>()
  for (const p of asPairs(data)) {
    const mint = pairTokenAddress(p, 'baseToken')
    if (!mint) continue
    const list = byMint.get(mint) || []
    list.push(p)
    byMint.set(mint, list)
  }
  const map = new Map<string, PublicCoinMeta>()
  for (const [mint, pairs] of byMint) map.set(mint, fromDexPairs(pairs))
  return map
}

/** Pump bonding-curve mcap from virtual reserves × SOL/USD. Never invents a SOL price. */
export function pumpCurveMarketCapUsd(
  o: Record<string, unknown>,
  solUsd: number | null | undefined,
): number | undefined {
  if (solUsd == null || !Number.isFinite(solUsd) || solUsd <= 0) return undefined
  const vs = Number(o.virtual_sol_reserves ?? o.virtualSolReserves ?? o.virtual_quote_reserves)
  const vt = Number(o.virtual_token_reserves ?? o.virtualTokenReserves)
  if (!Number.isFinite(vs) || !Number.isFinite(vt) || vs <= 0 || vt <= 0) return undefined
  const supplyRaw = Number(o.total_supply ?? o.token_total_supply ?? o.tokenTotalSupply)
  return marketCapFromCurveSnapshot(
    {
      virtualQuoteReserves: vs,
      virtualTokenReserves: vt,
      tokenTotalSupply: Number.isFinite(supplyRaw) && supplyRaw > 0 ? supplyRaw : PUMP_SUPPLY * 10 ** PUMP_DECIMALS,
    },
    solUsd,
  )
}

export function marketCapFromCurveSnapshot(
  curve: PumpCurveSnapshot,
  solUsd: number | null | undefined,
): number | undefined {
  if (solUsd == null || !Number.isFinite(solUsd) || solUsd <= 0) return undefined
  const vs = curve.virtualQuoteReserves
  const vt = curve.virtualTokenReserves
  const supply =
    Number.isFinite(curve.tokenTotalSupply) && curve.tokenTotalSupply > 0
      ? curve.tokenTotalSupply
      : PUMP_SUPPLY * 10 ** PUMP_DECIMALS
  if (!Number.isFinite(vs) || !Number.isFinite(vt) || vs <= 0 || vt <= 0) return undefined
  const mcapUsd = (vs / vt) * (supply / 1e9) * solUsd
  return Number.isFinite(mcapUsd) && mcapUsd > 0 ? mcapUsd : undefined
}

export function parseJupToken(data: unknown): PublicCoinMeta {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return {}
  const o = row as Record<string, unknown>
  const mcap = Number(o.mcap ?? o.fdv)
  const stats = o.stats24h && typeof o.stats24h === 'object' ? (o.stats24h as Record<string, unknown>) : null
  const chg = Number(stats?.priceChange)
  return cleanMeta({
    imageUrl: safeHttps(o.icon || o.logoURI || o.logo),
    marketCapUsd: Number.isFinite(mcap) && mcap > 0 ? mcap : undefined,
    priceChange24h: Number.isFinite(chg) ? chg : undefined,
    holders: Number.isFinite(Number(o.holderCount)) ? Number(o.holderCount) : undefined,
  })
}

async function defaultPumpCurveFetch(mint: string): Promise<PumpCurveSnapshot | null> {
  try {
    const curve = await new OnlinePumpSdk(getConnection()).fetchBondingCurve(mint)
    const vs = Number(curve.virtualQuoteReserves)
    const vt = Number(curve.virtualTokenReserves)
    const supply = Number(curve.tokenTotalSupply)
    if (!Number.isFinite(vs) || !Number.isFinite(vt) || vs <= 0 || vt <= 0) return null
    return {
      virtualQuoteReserves: vs,
      virtualTokenReserves: vt,
      tokenTotalSupply: Number.isFinite(supply) && supply > 0 ? supply : PUMP_SUPPLY * 10 ** PUMP_DECIMALS,
      complete: Boolean(curve.complete),
    }
  } catch {
    return null
  }
}

export function parsePumpCoinMeta(
  data: unknown,
  opts?: { solUsd?: number | null },
): PublicCoinMeta {
  if (!data || typeof data !== 'object') return {}
  const o = data as Record<string, unknown>
  const g = detectPumpGraduation(o)
  const usd = Number(o.usd_market_cap ?? o.usdMarketCap)
  let marketCapUsd: number | undefined
  if (Number.isFinite(usd) && usd > 0) marketCapUsd = usd
  if (marketCapUsd == null) {
    const raw = Number(o.market_cap ?? o.marketCap)
    if (Number.isFinite(raw) && raw >= 1_000) marketCapUsd = raw
  }
  if (marketCapUsd == null) marketCapUsd = pumpCurveMarketCapUsd(o, opts?.solUsd)
  return cleanMeta({
    imageUrl: safeHttps(o.image_uri || o.imageUri || o.image),
    twitter: normalizeTwitter(o.twitter || o.twitter_url),
    website: safeHttps(o.website),
    telegram: safeHttps(o.telegram),
    marketCapUsd,
    graduated: g.graduated || undefined,
    graduatedVia: g.via || undefined,
  })
}

/** Launch metadata (image/socials) wins; Dexscreener quotes win when present. */
export function mergePublicCoinMeta(launch: PublicCoinMeta, quote: PublicCoinMeta): PublicCoinMeta {
  return composeCoinMeta({ pump: launch, dex: quote })
}

export function composeCoinMeta(parts: {
  pump?: PublicCoinMeta
  jup?: PublicCoinMeta
  dex?: PublicCoinMeta
  curveMcap?: number
  curveComplete?: boolean
}): PublicCoinMeta {
  const pump = parts.pump || {}
  const jup = parts.jup || {}
  const dex = parts.dex || {}
  return cleanMeta({
    imageUrl: pump.imageUrl || jup.imageUrl || dex.imageUrl,
    twitter: pump.twitter || dex.twitter || jup.twitter,
    website: pump.website || dex.website,
    telegram: pump.telegram || dex.telegram,
    volumeUsd: dex.volumeUsd ?? pump.volumeUsd,
    holders: pump.holders ?? jup.holders ?? dex.holders,
    marketCapUsd: dex.marketCapUsd ?? pump.marketCapUsd ?? parts.curveMcap ?? jup.marketCapUsd,
    priceChange24h: dex.priceChange24h ?? jup.priceChange24h ?? pump.priceChange24h,
    graduated: pump.graduated || dex.graduated || parts.curveComplete || undefined,
    graduatedVia: pump.graduatedVia || (parts.curveComplete ? 'pump-complete' : undefined) || dex.graduatedVia,
    dexId: dex.dexId || pump.dexId,
  })
}

function cleanMeta(meta: PublicCoinMeta): PublicCoinMeta {
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
  return cleaned
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

async function fetchDexBatches(
  chainId: string,
  mints: string[],
): Promise<Map<string, PublicCoinMeta>> {
  const out = new Map<string, PublicCoinMeta>()
  if (!mints.length) return out
  const batches = await Promise.all(
    chunkMints(mints).map((batch) => fetchJson(dexTokensV1Url(chainId, batch))),
  )
  for (const data of batches) {
    for (const [mint, meta] of indexDexQuotes(data)) out.set(mint, meta)
  }
  return out
}

async function fetchPumpMeta(
  mint: string,
  solUsd: number | null,
): Promise<PublicCoinMeta> {
  return parsePumpCoinMeta(
    await fetchJson(`https://frontend-api-v3.pump.fun/coins/${encodeURIComponent(mint)}`),
    { solUsd },
  )
}

/** Batched Dexscreener `/tokens/v1` quotes + Pump bonding-curve fallback. */
export async function enrichPublicCoinMetas(
  coins: { mint: string; pumpUrl?: string; platform?: string }[],
  now = Date.now(),
): Promise<Map<string, PublicCoinMeta>> {
  const out = new Map<string, PublicCoinMeta>()
  const stale: typeof coins = []
  for (const coin of coins) {
    const cached = metaCache.get(coin.mint)
    if (cached && now - cached.at < COIN_META_TTL_MS) out.set(coin.mint, cached.meta)
    else stale.push(coin)
  }
  if (!stale.length) return out

  const byChain = new Map<string, typeof stale>()
  for (const coin of stale) {
    const chain = dexChainId(coin)
    const list = byChain.get(chain) || []
    list.push(coin)
    byChain.set(chain, list)
  }

  const dexByMint = new Map<string, PublicCoinMeta>()
  await Promise.all(
    [...byChain.entries()].map(async ([chain, group]) => {
      const quotes = await fetchDexBatches(
        chain,
        group.map((c) => c.mint),
      )
      for (const [mint, meta] of quotes) dexByMint.set(mint, meta)
    }),
  )

  const pumpish = stale.filter((c) => (c.platform || 'pumpfun') !== 'zora')
  let solUsd: number | null = null
  if (pumpish.length) {
    const needCurve = pumpish.some((c) => !dexByMint.get(c.mint)?.marketCapUsd)
    if (needCurve) {
      solUsd = (await getFxRates(now).catch(() => null))?.solUsd ?? null
    }
  }
  const pumpByMint = new Map<string, PublicCoinMeta>()
  const jupByMint = new Map<string, PublicCoinMeta>()
  await Promise.all(
    pumpish.map(async (coin) => {
      const [pump, jup] = await Promise.all([
        fetchPumpMeta(coin.mint, solUsd),
        parseJupToken(
          await fetchJson(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(coin.mint)}`),
        ),
      ])
      pumpByMint.set(coin.mint, pump)
      jupByMint.set(coin.mint, jup)
    }),
  )

  const needCurve = pumpish.filter((c) => {
    const dex = dexByMint.get(c.mint)
    const pump = pumpByMint.get(c.mint)
    return !dex?.marketCapUsd && !pump?.marketCapUsd
  })
  const curveByMint = new Map<string, PumpCurveSnapshot>()
  await Promise.all(
    needCurve.map(async (coin) => {
      const snap = await pumpCurveFetchImpl(coin.mint)
      if (snap) curveByMint.set(coin.mint, snap)
    }),
  )

  for (const coin of stale) {
    const curve = curveByMint.get(coin.mint)
    const merged = composeCoinMeta({
      pump: pumpByMint.get(coin.mint),
      jup: jupByMint.get(coin.mint),
      dex: dexByMint.get(coin.mint),
      curveMcap: curve ? marketCapFromCurveSnapshot(curve, solUsd) : undefined,
      curveComplete: curve?.complete,
    })
    metaCache.set(coin.mint, { at: now, meta: merged })
    out.set(coin.mint, merged)
  }
  return out
}

/** Public metadata (image/socials/quotes) from pump.fun / DexScreener — no secrets. */
export async function enrichPublicCoinMeta(coin: {
  mint: string
  pumpUrl?: string
  platform?: string
}): Promise<PublicCoinMeta> {
  const map = await enrichPublicCoinMetas([coin])
  return map.get(coin.mint) || {}
}

export function toPublicCoinPage(coin: ApiCoin, meta: PublicCoinMeta = {}): PublicCoinPage {
  const links = publicCoinLinks(coin)
  return {
    ...coin,
    ...meta,
    pageUrl: links.coinUrl,
    ...links,
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
