/** Launch venues (Pump.fun / Bags.fm / Zora). Prefer discovery JSON over hardcoding. */

import { CREW_AGENT_API_URL, CREW_PUBLIC_API_URL } from './config'

export const LAUNCH_PLATFORMS = ['pumpfun', 'bags', 'zora'] as const
export type LaunchPlatform = (typeof LAUNCH_PLATFORMS)[number]

export type LaunchVenueStatus = 'live' | 'testnet' | 'disabled'

export type LaunchVenue = {
  id: LaunchPlatform
  name: string
  chain: 'solana' | 'base'
  enabled: boolean
  status: LaunchVenueStatus
  caption?: string
  tradeHost: string
  explorer: 'solscan' | 'basescan'
  note: string
}

export const DEFAULT_LAUNCH_PLATFORM: LaunchPlatform = 'pumpfun'

export const LAUNCH_FEE_MAP_COPY =
  '60% hired KOL crew / 15% launching agent / rest treasury'

/** Fallback when discovery/OpenAPI is unreachable. Zora stays disabled (testnet / soon). */
export const FALLBACK_LAUNCH_VENUES: LaunchVenue[] = [
  {
    id: 'pumpfun',
    name: 'Pump.fun',
    chain: 'solana',
    enabled: true,
    status: 'live',
    tradeHost: 'pump.fun',
    explorer: 'solscan',
    note: 'Default. Solana Pump.fun create + CREW fee-share lock.',
  },
  {
    id: 'bags',
    name: 'Bags.fm',
    chain: 'solana',
    enabled: true,
    status: 'live',
    tradeHost: 'bags.fm',
    explorer: 'solscan',
    note: 'Unsigned Solana fee-claimer launches.',
  },
  {
    id: 'zora',
    name: 'Zora',
    chain: 'base',
    enabled: false,
    status: 'disabled',
    caption: 'testnet / soon',
    tradeHost: 'zora.co',
    explorer: 'basescan',
    note: 'Off unless the API sets ZORA_ENABLED. Base Sepolia default.',
  },
]

export function isLaunchPlatform(value: unknown): value is LaunchPlatform {
  return value === 'pumpfun' || value === 'bags' || value === 'zora'
}

export function parseLaunchPlatform(raw?: string | null): LaunchPlatform {
  const v = (raw || DEFAULT_LAUNCH_PLATFORM).trim().toLowerCase()
  if (v === 'pump' || v === 'pump.fun' || v === 'pumpfun') return 'pumpfun'
  if (v === 'bags' || v === 'bags.fm' || v === 'bagsfm') return 'bags'
  if (v === 'zora' || v === 'zora-coins' || v === 'zoracoins') return 'zora'
  return DEFAULT_LAUNCH_PLATFORM
}

export function platformDisplayName(platform: LaunchPlatform): string {
  if (platform === 'bags') return 'Bags.fm'
  if (platform === 'zora') return 'Zora'
  return 'Pump.fun'
}

export function platformMark(platform: LaunchPlatform): string {
  if (platform === 'bags') return 'B'
  if (platform === 'zora') return 'Z'
  return 'P'
}

const EVM_RE = /^0x[a-fA-F0-9]{40}$/

export function inferLaunchPlatform(opts: {
  platform?: string | null
  pumpUrl?: string | null
  mint?: string | null
}): LaunchPlatform {
  if (opts.platform) {
    const parsed = parseLaunchPlatform(opts.platform)
    if (opts.platform.trim() && parsed) return parsed
  }
  const url = (opts.pumpUrl || '').toLowerCase()
  if (url.includes('bags.fm')) return 'bags'
  if (url.includes('zora.co') || url.includes('zora.energy')) return 'zora'
  const mint = (opts.mint || '').trim()
  if (EVM_RE.test(mint)) return 'zora'
  return 'pumpfun'
}

export function tradeUrl(platform: LaunchPlatform, mint: string): string {
  if (platform === 'bags') return `https://bags.fm/${mint}`
  if (platform === 'zora') {
    const chain = mint.startsWith('0x') ? 'base' : 'base'
    return `https://zora.co/coin/${chain}:${mint}`
  }
  return `https://pump.fun/coin/${mint}`
}

export function tradeLabel(platform: LaunchPlatform): string {
  if (platform === 'bags') return 'bags.fm'
  if (platform === 'zora') return 'zora.co'
  return 'pump.fun'
}

export function explorerTokenUrl(platform: LaunchPlatform, mint: string): string | null {
  if (!mint) return null
  if (platform === 'zora') return `https://basescan.org/token/${mint}`
  return `https://solscan.io/token/${mint}`
}

export function explorerTxUrl(platform: LaunchPlatform, signature: string): string | null {
  if (!signature || signature.startsWith('quest:')) return null
  if (platform === 'zora') {
    if (signature.startsWith('0x')) return `https://basescan.org/tx/${signature}`
    return `https://basescan.org/tx/${signature}`
  }
  return `https://solscan.io/tx/${signature}`
}

export function explorerLabel(platform: LaunchPlatform): string {
  return platform === 'zora' ? 'Basescan' : 'Solscan'
}

export function isAllowedTradeUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    return (
      host === 'pump.fun' ||
      host === 'www.pump.fun' ||
      host === 'bags.fm' ||
      host === 'www.bags.fm' ||
      host === 'zora.co' ||
      host === 'www.zora.co'
    )
  } catch {
    return false
  }
}

type DiscoveryDoc = {
  platforms?: {
    default?: string
    feeMap?: string
    venues?: Array<Partial<LaunchVenue> & { id?: string }>
  }
}

type OpenApiDoc = {
  components?: {
    schemas?: {
      LaunchRequest?: {
        properties?: {
          platform?: { enum?: string[]; default?: string }
        }
      }
    }
  }
}

function normalizeVenue(raw: Partial<LaunchVenue> & { id?: string }): LaunchVenue | null {
  if (!isLaunchPlatform(raw.id)) return null
  const fallback = FALLBACK_LAUNCH_VENUES.find((v) => v.id === raw.id)!
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled
  const status: LaunchVenueStatus =
    raw.status === 'live' || raw.status === 'testnet' || raw.status === 'disabled'
      ? raw.status
      : enabled
        ? fallback.status
        : 'disabled'
  const caption =
    raw.caption ||
    (!enabled && raw.id === 'zora' ? 'testnet / soon' : fallback.caption)
  return {
    id: raw.id,
    name: raw.name || fallback.name,
    chain: raw.chain === 'base' ? 'base' : fallback.chain,
    enabled,
    status,
    caption,
    tradeHost: raw.tradeHost || fallback.tradeHost,
    explorer: raw.explorer === 'basescan' ? 'basescan' : fallback.explorer,
    note: raw.note || fallback.note,
  }
}

/** Merge discovery venues onto the known three ids (order: pumpfun, bags, zora). */
export function venuesFromDiscovery(doc: unknown): LaunchVenue[] | null {
  const platforms = (doc as DiscoveryDoc | null)?.platforms
  if (!platforms?.venues?.length) return null
  const byId = new Map<LaunchPlatform, LaunchVenue>()
  for (const row of platforms.venues) {
    const venue = normalizeVenue(row)
    if (venue) byId.set(venue.id, venue)
  }
  if (!byId.size) return null
  return FALLBACK_LAUNCH_VENUES.map((fallback) => byId.get(fallback.id) || fallback)
}

export function venuesFromOpenApi(doc: unknown): LaunchVenue[] | null {
  const enums = (doc as OpenApiDoc | null)?.components?.schemas?.LaunchRequest?.properties?.platform
    ?.enum
  if (!Array.isArray(enums) || !enums.length) return null
  const ids = enums.filter(isLaunchPlatform)
  if (!ids.length) return null
  return FALLBACK_LAUNCH_VENUES.map((fallback) => {
    if (!ids.includes(fallback.id)) {
      return { ...fallback, enabled: false, status: 'disabled' as const }
    }
    if (fallback.id === 'zora') {
      return { ...fallback, enabled: false, status: 'disabled', caption: 'testnet / soon' }
    }
    return fallback
  })
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * Read supported venues from GET /api/agent (platforms) then OpenAPI enum.
 * Never throws — always returns a three-venue list.
 */
export async function fetchLaunchVenues(): Promise<LaunchVenue[]> {
  const bases = [CREW_AGENT_API_URL.replace(/\/$/, ''), CREW_PUBLIC_API_URL]
  for (const base of [...new Set(bases)]) {
    try {
      const discovery = await getJson(`${base}/api/agent`)
      const fromDiscovery = venuesFromDiscovery(discovery)
      if (fromDiscovery) return fromDiscovery
    } catch {
      /* try openapi */
    }
    try {
      const openapi = await getJson(`${base}/openapi.json`)
      const fromSpec = venuesFromOpenApi(openapi)
      if (fromSpec) return fromSpec
    } catch {
      /* next base */
    }
  }
  return FALLBACK_LAUNCH_VENUES
}

export function unsignedLaunchCurl(opts: {
  platform: LaunchPlatform
  name?: string
  ticker?: string
  description?: string
}): string {
  const name = (opts.name || 'Desk Cat').slice(0, 32)
  const ticker = (opts.ticker || 'DCAT').slice(0, 13)
  const description = (opts.description || 'ai agent hires kols').slice(0, 204)
  return `curl -sS ${CREW_PUBLIC_API_URL}/api/agent/launch/unsigned \\
  -H "content-type: application/json" \\
  -H "x-crew-api-key: $CREW_AGENT_API_KEY" \\
  -d '{
    "platform": "${opts.platform}",
    "name": ${JSON.stringify(name)},
    "ticker": ${JSON.stringify(ticker)},
    "description": ${JSON.stringify(description)},
    "mode": "agent",
    "imageUrl": "https://example.com/cat.png",
    "launcherPubkey": "${opts.platform === 'zora' ? '0xYOUR_EVM_PUBKEY' : 'YOUR_SOLANA_PUBKEY'}",
    "autoHire": { "seats": 5 }
  }'`
}
