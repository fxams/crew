/** x402 pay-per-call (HTTP 402). Prefer GET /api/platforms → x402 over hardcoding. */

import { CREW_PUBLIC_API_URL } from './config'

export const X402_HREF = 'https://x402.org'

export type X402Network = 'base' | 'solana'

export type X402Prices = {
  launch: string
  autohire: string
}

export type X402Info = {
  enabled: boolean
  asset: string
  networks: X402Network[]
  prices: X402Prices
  requestHeader: string
  alternativeAuth: string
}

/** Shown when discovery is unreachable or omits prices/networks. */
export const FALLBACK_X402: X402Info = {
  enabled: true,
  asset: 'USDC',
  networks: ['base', 'solana'],
  prices: { launch: '$0.10', autohire: '$0.02' },
  requestHeader: 'X-PAYMENT',
  alternativeAuth: 'x-crew-api-key',
}

type RawX402 = {
  enabled?: unknown
  asset?: unknown
  networks?: unknown
  prices?: {
    launch?: unknown
    unsigned?: unknown
    autohire?: unknown
  }
  headers?: { request?: unknown }
  alternativeAuth?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/** Pull the x402 object from /api/platforms, /api/agent, or a nested copy. */
export function pickX402Raw(doc: unknown): RawX402 | null {
  const root = asRecord(doc)
  if (!root) return null
  if (asRecord(root.x402)) return root.x402 as RawX402
  const platforms = asRecord(root.platforms)
  if (platforms && asRecord(platforms.x402)) return platforms.x402 as RawX402
  const auth = asRecord(root.auth)
  if (auth && asRecord(auth.x402)) return auth.x402 as RawX402
  return null
}

function formatUsd(raw: unknown, fallback: string): string {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return `$${raw.toFixed(2)}`
  }
  if (typeof raw !== 'string') return fallback
  const n = Number(raw.trim().replace(/^\$/, ''))
  if (!Number.isFinite(n) || n < 0) return fallback
  return `$${n.toFixed(2)}`
}

function parseNetworks(raw: unknown): X402Network[] {
  if (!Array.isArray(raw)) return [...FALLBACK_X402.networks]
  const out: X402Network[] = []
  for (const item of raw) {
    const v = String(item).trim().toLowerCase()
    if ((v === 'base' || v === 'eip155:8453') && !out.includes('base')) out.push('base')
    if ((v === 'solana' || v === 'sol' || v === 'svm' || v.startsWith('solana:')) && !out.includes('solana')) {
      out.push('solana')
    }
  }
  return out.length ? out : [...FALLBACK_X402.networks]
}

export function normalizeX402(raw: RawX402 | null | undefined): X402Info {
  if (!raw) return { ...FALLBACK_X402, prices: { ...FALLBACK_X402.prices }, networks: [...FALLBACK_X402.networks] }
  const launch = formatUsd(raw.prices?.launch ?? raw.prices?.unsigned, FALLBACK_X402.prices.launch)
  const autohire = formatUsd(raw.prices?.autohire, FALLBACK_X402.prices.autohire)
  const asset = typeof raw.asset === 'string' && raw.asset.trim() ? raw.asset.trim().toUpperCase() : FALLBACK_X402.asset
  const requestHeader =
    typeof raw.headers?.request === 'string' && raw.headers.request.trim()
      ? raw.headers.request.trim()
      : FALLBACK_X402.requestHeader
  const alternativeAuth =
    typeof raw.alternativeAuth === 'string' && raw.alternativeAuth.trim()
      ? raw.alternativeAuth.trim()
      : FALLBACK_X402.alternativeAuth
  return {
    enabled: raw.enabled === true,
    asset,
    networks: parseNetworks(raw.networks),
    prices: { launch, autohire },
    requestHeader,
    alternativeAuth,
  }
}

/** Always returns a display-ready object — fallback prices/networks if discovery is sparse. */
export function x402FromDoc(doc: unknown): X402Info {
  return normalizeX402(pickX402Raw(doc))
}

export function formatX402Networks(networks: X402Network[]): string {
  const hasBase = networks.includes('base')
  const hasSol = networks.includes('solana')
  if (hasBase && hasSol) return 'Base or Solana'
  if (hasBase) return 'Base'
  if (hasSol) return 'Solana'
  return 'Base or Solana'
}

/** Full Auth-pill copy: x402 pay per call ($0.10 USDC, Base or Solana) */
export function x402PayLabel(info: X402Info): string {
  return `x402 pay per call (${info.prices.launch} ${info.asset}, ${formatX402Networks(info.networks)})`
}

export function x402KeyLabel(): string {
  return 'API key (free)'
}

/** Short curl: 402 retry with X-PAYMENT, no API key. */
export function x402LaunchCurl(info: X402Info = FALLBACK_X402): string {
  const header = info.requestHeader || 'X-PAYMENT'
  return `curl -sS ${CREW_PUBLIC_API_URL}/api/agent/launch/unsigned \\
  -H "content-type: application/json" \\
  -H "${header}: $X402_PAYMENT" \\
  -d '{"platform":"pumpfun","name":"Desk Cat","ticker":"DCAT","mode":"agent"}'`
}

export function x402SnippetNote(info: X402Info): string {
  return `Unpaid calls return 402. Retry with ${info.requestHeader}.`
}
