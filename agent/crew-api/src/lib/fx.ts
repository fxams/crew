/**
 * Cached SOL/ETH → USD feed for kickoff budget math.
 * Env CREW_SOL_USD / CREW_ETH_USD override (tests/ops). Never guess.
 */

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const DEFAULT_TTL_MS = 120_000

export type FxRates = {
  solUsd: number | null
  ethUsd: number | null
  at: number
  ttlMs: number
  source: 'env' | 'dexscreener' | 'coingecko' | 'mixed' | 'none'
}

type FetchJson = (url: string) => Promise<unknown | null>

let cache: FxRates | null = null
let fetchJsonImpl: FetchJson = defaultFetchJson

export function fxTtlMs(): number {
  return clampTtlMs('KICKOFF_FX_TTL_MS', DEFAULT_TTL_MS)
}

export function resetFxCache() {
  cache = null
}

export function peekFx(): FxRates | null {
  return cache
}

export function setFxFetch(fn: FetchJson | null) {
  fetchJsonImpl = fn || defaultFetchJson
}

/** Seed cache (tests). */
export function seedFx(rates: Partial<FxRates>) {
  cache = {
    solUsd: rates.solUsd ?? null,
    ethUsd: rates.ethUsd ?? null,
    at: rates.at ?? Date.now(),
    ttlMs: rates.ttlMs ?? fxTtlMs(),
    source: rates.source ?? 'env',
  }
}

export function envSolUsd(): number | null {
  return posEnv('CREW_SOL_USD')
}

export function envEthUsd(): number | null {
  return posEnv('CREW_ETH_USD')
}

export async function getFxRates(now = Date.now()): Promise<FxRates> {
  const ttl = fxTtlMs()
  const envSol = envSolUsd()
  const envEth = envEthUsd()
  if (envSol != null || envEth != null) {
    const next: FxRates = {
      solUsd: envSol,
      ethUsd: envEth,
      at: now,
      ttlMs: ttl,
      source: 'env',
    }
    cache = next
    return next
  }
  if (cache && now - cache.at < cache.ttlMs) return cache

  const [dex, gecko] = await Promise.all([fromDexscreener(), fromCoinGecko()])
  const solUsd = dex.solUsd ?? gecko.solUsd
  const ethUsd = dex.ethUsd ?? gecko.ethUsd
  let source: FxRates['source'] = 'none'
  if (dex.solUsd != null || dex.ethUsd != null) source = 'dexscreener'
  if (gecko.solUsd != null || gecko.ethUsd != null) {
    source = source === 'dexscreener' ? 'mixed' : 'coingecko'
  }
  const next: FxRates = { solUsd, ethUsd, at: now, ttlMs: ttl, source }
  cache = next
  return next
}

async function fromDexscreener(): Promise<{ solUsd: number | null; ethUsd: number | null }> {
  const [sol, eth] = await Promise.all([
    priceFromDex(`https://api.dexscreener.com/latest/dex/tokens/${SOL_MINT}`),
    priceFromDex(`https://api.dexscreener.com/latest/dex/tokens/${WETH}`),
  ])
  return { solUsd: sol, ethUsd: eth }
}

async function fromCoinGecko(): Promise<{ solUsd: number | null; ethUsd: number | null }> {
  const data = await fetchJsonImpl(
    'https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum&vs_currencies=usd',
  )
  if (!data || typeof data !== 'object') return { solUsd: null, ethUsd: null }
  const o = data as Record<string, { usd?: unknown } | undefined>
  return {
    solUsd: posNum(o.solana?.usd),
    ethUsd: posNum(o.ethereum?.usd),
  }
}

async function priceFromDex(url: string): Promise<number | null> {
  const data = await fetchJsonImpl(url)
  if (!data || typeof data !== 'object') return null
  const pairs = (data as { pairs?: unknown }).pairs
  if (!Array.isArray(pairs) || !pairs.length) return null
  const ranked = pairs
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
    .sort((a, b) => Number(b.liquidity && typeof b.liquidity === 'object'
      ? (b.liquidity as { usd?: unknown }).usd || 0
      : 0) - Number(a.liquidity && typeof a.liquidity === 'object'
      ? (a.liquidity as { usd?: unknown }).usd || 0
      : 0))
  const first = ranked[0]
  return first ? posNum(first.priceUsd) : null
}

async function defaultFetchJson(url: string): Promise<unknown | null> {
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

function posEnv(name: string): number | null {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? n : null
}

function posNum(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function clampTtlMs(name: string, fallback: number): number {
  const n = Number(process.env[name])
  const raw = Number.isFinite(n) && n > 0 ? n : fallback
  return Math.min(5 * 60_000, Math.max(60_000, raw))
}
