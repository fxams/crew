/** Launch venues (Pump.fun / Bags.fm / Zora). Prefer discovery JSON over hardcoding. */

import { CREW_AGENT_API_URL, CREW_PUBLIC_API_URL } from './config'

export const LAUNCH_PLATFORMS = ['pumpfun', 'bags', 'zora'] as const
export type LaunchPlatform = (typeof LAUNCH_PLATFORMS)[number]

export type LaunchVenueStatus = 'live' | 'testnet' | 'disabled'
export type LaunchChain = 'solana' | 'base' | 'base-sepolia'

export type LaunchVenue = {
  id: LaunchPlatform
  name: string
  chain: LaunchChain
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

/** Fallback when discovery/OpenAPI is unreachable. Zora stays disabled (soon). Bags stays on (live). */
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
    chain: 'base-sepolia',
    enabled: false,
    status: 'disabled',
    caption: 'soon',
    tradeHost: 'zora.co',
    explorer: 'basescan',
    note: 'Off unless the API sets ZORA_ENABLED and a 0x treasury. Base Sepolia default.',
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
    return `https://zora.co/coin/base:${mint}`
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
    venues?: Array<Partial<LaunchVenue> & { id?: string; chain?: string }>
  }
}

type PlatformsDoc = {
  venues?: Array<Partial<LaunchVenue> & { id?: string; chain?: string }>
  platforms?: DiscoveryDoc['platforms']
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

export function parseVenueChain(raw: unknown, id: LaunchPlatform): LaunchChain {
  if (raw === 'base-sepolia' || raw === 'sepolia') return 'base-sepolia'
  if (raw === 'base') return 'base'
  if (raw === 'solana') return 'solana'
  return id === 'zora' ? 'base-sepolia' : 'solana'
}

/** Zora chip copy: Base (mainnet), testnet (Sepolia), soon (off). */
export function zoraCaption(enabled: boolean, chain: LaunchChain): string {
  if (!enabled) return 'soon'
  return chain === 'base' ? 'Base' : 'testnet'
}

function normalizeVenue(raw: Partial<LaunchVenue> & { id?: string; chain?: string }): LaunchVenue | null {
  if (!isLaunchPlatform(raw.id)) return null
  const fallback = FALLBACK_LAUNCH_VENUES.find((v) => v.id === raw.id)!
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled
  const chain = parseVenueChain(raw.chain, raw.id)
  const status: LaunchVenueStatus =
    raw.status === 'live' || raw.status === 'testnet' || raw.status === 'disabled'
      ? raw.status
      : enabled
        ? chain === 'base-sepolia'
          ? 'testnet'
          : 'live'
        : 'disabled'
  const rawCaption =
    raw.caption === 'testnet / soon' || raw.caption === 'needs BAGS_API_KEY'
      ? undefined
      : raw.caption
  const caption =
    rawCaption ||
    (raw.id === 'zora' ? zoraCaption(enabled, chain) : !enabled ? 'soon' : fallback.caption)
  return {
    id: raw.id,
    name: raw.name || fallback.name,
    chain,
    enabled,
    status,
    caption,
    tradeHost: raw.tradeHost || fallback.tradeHost,
    explorer: raw.explorer === 'basescan' ? 'basescan' : fallback.explorer,
    note: raw.note || fallback.note,
  }
}

function venuesFromRows(
  rows: Array<Partial<LaunchVenue> & { id?: string; chain?: string }> | undefined,
): LaunchVenue[] | null {
  if (!rows?.length) return null
  const byId = new Map<LaunchPlatform, LaunchVenue>()
  for (const row of rows) {
    const venue = normalizeVenue(row)
    if (venue) byId.set(venue.id, venue)
  }
  if (!byId.size) return null
  return FALLBACK_LAUNCH_VENUES.map((fallback) => byId.get(fallback.id) || fallback)
}

/** Merge discovery venues onto the known three ids (order: pumpfun, bags, zora). */
export function venuesFromDiscovery(doc: unknown): LaunchVenue[] | null {
  return venuesFromRows((doc as DiscoveryDoc | null)?.platforms?.venues)
}

export function venuesFromPlatformsPayload(doc: unknown): LaunchVenue[] | null {
  const d = doc as PlatformsDoc | null
  return venuesFromRows(d?.venues) || venuesFromRows(d?.platforms?.venues)
}

export function venuesFromOpenApi(doc: unknown): LaunchVenue[] | null {
  const enums = (doc as OpenApiDoc | null)?.components?.schemas?.LaunchRequest?.properties?.platform
    ?.enum
  if (!Array.isArray(enums) || !enums.length) return null
  const ids = enums.filter(isLaunchPlatform)
  if (!ids.length) return null
  return FALLBACK_LAUNCH_VENUES.map((fallback) => {
    if (!ids.includes(fallback.id)) {
      return { ...fallback, enabled: false, status: 'disabled' as const, caption: 'soon' }
    }
    if (fallback.id === 'zora') {
      return {
        ...fallback,
        enabled: false,
        status: 'disabled' as const,
        caption: 'soon',
        chain: 'base-sepolia' as const,
      }
    }
    return fallback
  })
}

export function unsignedVenueHint(venue: LaunchVenue): string {
  if (venue.id === 'zora') {
    if (!venue.enabled) {
      return 'Zora is soon unless the API enables it. Unsigned EIP-1559 — crew wallets must be 0x.'
    }
    if (venue.chain === 'base') {
      return 'Zora on Base. Unsigned EIP-1559 — crew wallets must be 0x.'
    }
    return 'Zora on Base Sepolia (testnet). Unsigned EIP-1559 — crew wallets must be 0x.'
  }
  if (venue.id === 'bags') {
    return venue.enabled
      ? 'Bags.fm is live via Agent unsigned. This desk copies the request; sign in your agent.'
      : 'Bags.fm is soon unless the API enables it.'
  }
  return 'Default Pump.fun — Phantom signs on Solana.'
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * Read supported venues from GET /api/platforms, then GET /api/agent, then OpenAPI enum.
 * Never throws — always returns a three-venue list. Fallback keeps Zora off.
 */
export async function fetchLaunchVenues(): Promise<LaunchVenue[]> {
  const bases = [CREW_AGENT_API_URL.replace(/\/$/, ''), CREW_PUBLIC_API_URL]
  for (const base of [...new Set(bases)]) {
    try {
      const payload = await getJson(`${base}/api/platforms`)
      const fromPayload = venuesFromPlatformsPayload(payload)
      if (fromPayload) return fromPayload
    } catch {
      /* try discovery */
    }
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
