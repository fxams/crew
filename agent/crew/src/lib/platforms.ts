/** Launch venues (Pump.fun / Bags.fm / Zora). Prefer discovery JSON over hardcoding. */

import { CREW_AGENT_API_URL, CREW_PUBLIC_API_URL } from './config'
import { FALLBACK_ACP, acpFromDoc, type AcpInfo } from './acp'
import { FALLBACK_X402, x402FromDoc, type X402Info } from './x402'

export const LAUNCH_PLATFORMS = ['pumpfun', 'bags', 'zora', 'clanker', 'vibevibe'] as const
export type LaunchPlatform = (typeof LAUNCH_PLATFORMS)[number]

export type LaunchVenueStatus = 'live' | 'testnet' | 'disabled'
export type LaunchChain = 'solana' | 'base' | 'base-sepolia' | 'robinhood-testnet' | 'robinhood'

export type LaunchVenue = {
  id: LaunchPlatform
  name: string
  chain: LaunchChain
  enabled: boolean
  status: LaunchVenueStatus
  caption?: string
  /** Hint only — desk default stays pumpfun. */
  recommended?: boolean
  tradeHost: string
  explorer: 'solscan' | 'basescan' | 'robinhood'
  note: string
}

export const DEFAULT_LAUNCH_PLATFORM: LaunchPlatform = 'pumpfun'

export const LAUNCH_FEE_MAP_COPY =
  '60% to the KOL crew, 15% to the launching agent, 25% to the treasury'

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
    caption: 'recommended',
    recommended: true,
    tradeHost: 'bags.fm',
    explorer: 'solscan',
    note: 'Recommended Solana venue (desk default stays Pump.fun). Unsigned fee-claimer launches.',
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
  {
    id: 'clanker',
    name: 'Clanker',
    chain: 'base',
    enabled: false,
    status: 'disabled',
    caption: 'Base',
    tradeHost: 'clanker.world',
    explorer: 'basescan',
    note:
      'Clanker v4 on Base (chain from GET /api/platforms / CLANKER_CHAIN). KOLs need a Base (0x) payout wallet on their CrewPay profile for fee shares. Off unless CLANKER_ENABLED and a 0x treasury are set.',
  },
  {
    id: 'vibevibe',
    name: 'vibe/vibe',
    chain: 'robinhood-testnet',
    enabled: false,
    status: 'disabled',
    caption: 'Robinhood Chain testnet',
    tradeHost: 'testnet.vibevibe.fun',
    explorer: 'robinhood',
    note: 'vibe/vibe on Robinhood Chain testnet. Off unless VIBEVIBE_ENABLED and a 0x treasury are set.',
  },
]

export function isLaunchPlatform(value: unknown): value is LaunchPlatform {
  return (
    value === 'pumpfun' ||
    value === 'bags' ||
    value === 'zora' ||
    value === 'clanker' ||
    value === 'vibevibe'
  )
}

export function parseLaunchPlatform(raw?: string | null): LaunchPlatform {
  const v = (raw || DEFAULT_LAUNCH_PLATFORM).trim().toLowerCase()
  if (v === 'pump' || v === 'pump.fun' || v === 'pumpfun') return 'pumpfun'
  if (v === 'bags' || v === 'bags.fm' || v === 'bagsfm') return 'bags'
  if (v === 'zora' || v === 'zora-coins' || v === 'zoracoins') return 'zora'
  if (v === 'clanker' || v === 'clanker.world') return 'clanker'
  if (v === 'vibevibe' || v === 'vibe' || v === 'vibe-vibe' || v === 'vibevibe.fun') return 'vibevibe'
  return DEFAULT_LAUNCH_PLATFORM
}

export function platformDisplayName(platform: LaunchPlatform): string {
  if (platform === 'bags') return 'Bags.fm'
  if (platform === 'zora') return 'Zora'
  if (platform === 'clanker') return 'Clanker'
  if (platform === 'vibevibe') return 'vibe/vibe'
  return 'Pump.fun'
}

export function platformShortName(platform: LaunchPlatform): string {
  if (platform === 'bags') return 'Bags'
  if (platform === 'zora') return 'Zora'
  if (platform === 'clanker') return 'Clanker'
  if (platform === 'vibevibe') return 'vibe'
  return 'Pump'
}

/** Label under icon in home / agents platform chip row. */
export function platformChipLabel(platform: LaunchPlatform): string {
  if (platform === 'vibevibe') return 'vibe/vibe'
  return platformShortName(platform)
}

export function platformMark(platform: LaunchPlatform): string {
  if (platform === 'bags') return 'B'
  if (platform === 'zora') return 'Z'
  if (platform === 'clanker') return 'C'
  if (platform === 'vibevibe') return 'V'
  return 'P'
}

function isEvmLaunchPlatform(platform: LaunchPlatform): boolean {
  return platform === 'zora' || platform === 'clanker' || platform === 'vibevibe'
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
  if (url.includes('clanker.world')) return 'clanker'
  if (url.includes('vibevibe.fun')) return 'vibevibe'
  const mint = (opts.mint || '').trim()
  if (EVM_RE.test(mint)) return 'zora'
  return 'pumpfun'
}

export function tradeUrl(platform: LaunchPlatform, mint: string): string {
  if (platform === 'bags') return `https://bags.fm/${mint}`
  if (platform === 'zora') {
    return `https://zora.co/coin/base:${mint}`
  }
  if (platform === 'clanker') return `https://clanker.world/clanker/${mint}`
  if (platform === 'vibevibe') return `https://testnet.vibevibe.fun/token/${mint}`
  return `https://pump.fun/coin/${mint}`
}

export function tradeLabel(platform: LaunchPlatform): string {
  if (platform === 'bags') return 'bags.fm'
  if (platform === 'zora') return 'zora.co'
  if (platform === 'clanker') return 'clanker.world'
  if (platform === 'vibevibe') return 'testnet.vibevibe.fun'
  return 'pump.fun'
}

export function explorerTokenUrl(platform: LaunchPlatform, mint: string): string | null {
  if (!mint) return null
  if (platform === 'vibevibe') {
    return `https://explorer.testnet.chain.robinhood.com/token/${mint}`
  }
  if (isEvmLaunchPlatform(platform)) return `https://basescan.org/token/${mint}`
  return `https://solscan.io/token/${mint}`
}

export function explorerTxUrl(platform: LaunchPlatform, signature: string): string | null {
  if (!signature || signature.startsWith('quest:')) return null
  if (platform === 'vibevibe') {
    return `https://explorer.testnet.chain.robinhood.com/tx/${signature}`
  }
  if (isEvmLaunchPlatform(platform)) {
    return `https://basescan.org/tx/${signature}`
  }
  return `https://solscan.io/tx/${signature}`
}

export function explorerLabel(platform: LaunchPlatform): string {
  if (platform === 'vibevibe') return 'Robinhood explorer'
  return isEvmLaunchPlatform(platform) ? 'Basescan' : 'Solscan'
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
      host === 'www.zora.co' ||
      host === 'clanker.world' ||
      host === 'www.clanker.world' ||
      host === 'testnet.vibevibe.fun' ||
      host === 'vibevibe.fun' ||
      host === 'www.vibevibe.fun'
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
  if (raw === 'robinhood-testnet' || raw === 'robinhood') return raw
  if (id === 'vibevibe') return 'robinhood-testnet'
  if (id === 'zora') return 'base-sepolia'
  if (id === 'clanker') return 'base'
  return 'solana'
}

/** Zora chip copy: Base (mainnet), testnet (Sepolia), soon (off). */
export function zoraCaption(enabled: boolean, chain: LaunchChain): string {
  if (!enabled) return 'soon'
  return chain === 'base' ? 'Base' : 'testnet'
}

/** Clanker chip copy: Base (mainnet), Base Sepolia (testnet), soon (off). */
export function clankerCaption(enabled: boolean, chain: LaunchChain): string {
  if (!enabled) return 'soon'
  return chain === 'base' ? 'Base' : 'Base Sepolia (testnet)'
}

/** Human label for marketing copy — uses API venue row when available. */
export function clankerLaunchLabel(venues?: LaunchVenue[]): string {
  const row = venues?.find((v) => v.id === 'clanker')
  if (row?.enabled && row.caption && row.caption !== 'soon') {
    return row.chain === 'base-sepolia' ? `Clanker (${row.caption})` : `Clanker on ${row.caption}`
  }
  return 'Clanker on Base'
}

export function vibevibeCaption(_enabled?: boolean, chain?: LaunchChain): string {
  return chain === 'robinhood' ? 'Robinhood Chain' : 'Robinhood Chain testnet'
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
    (raw.id === 'zora'
      ? zoraCaption(enabled, chain)
      : raw.id === 'clanker'
        ? clankerCaption(enabled, chain)
        : raw.id === 'vibevibe'
          ? vibevibeCaption(enabled, chain)
          : !enabled
          ? 'soon'
          : fallback.caption)
  return {
    id: raw.id,
    name: raw.name || fallback.name,
    chain,
    enabled,
    status,
    caption,
    recommended: raw.recommended ?? fallback.recommended,
    tradeHost: raw.tradeHost || fallback.tradeHost,
    explorer:
      raw.explorer === 'basescan' || raw.explorer === 'robinhood' ? raw.explorer : fallback.explorer,
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
  if (venue.id === 'vibevibe') {
    if (!venue.enabled) {
      return 'vibe/vibe is soon unless the API enables it. Unsigned EIP-1559 — crew wallets must be 0x.'
    }
    return 'vibe/vibe on Robinhood Chain. Unsigned EIP-1559 — crew wallets must be 0x. See fee-split docs.'
  }
  if (venue.id === 'zora') {
    if (!venue.enabled) {
      return 'Zora is soon unless the API enables it. Unsigned EIP-1559 — crew wallets must be 0x.'
    }
    if (venue.chain === 'base') {
      return 'Zora on Base. Unsigned EIP-1559 — crew wallets must be 0x.'
    }
    return 'Zora on Base Sepolia (testnet). Unsigned EIP-1559 — crew wallets must be 0x.'
  }
  if (venue.id === 'clanker') {
    if (!venue.enabled) {
      return 'Clanker is soon unless the API enables it (CLANKER_ENABLED + 0x treasury). Chain follows CLANKER_CHAIN.'
    }
    const chainLabel =
      venue.chain === 'base' ? 'Base mainnet' : 'Base Sepolia (testnet)'
    return `Clanker on ${chainLabel}. Unsigned EIP-1559. KOLs need a Base (0x) payout wallet (evm_wallet) on their CrewPay profile to receive Clanker fee shares.`
  }
  if (venue.id === 'bags') {
    return venue.enabled
      ? 'Recommended Solana venue. Bags.fm is live via Agent unsigned. Desk default stays Pump.fun.'
      : 'Bags.fm is recommended when the API enables it (BAGS_API_KEY). Default stays Pump.fun.'
  }
  return 'Default Pump.fun — sign with your Solana wallet.'
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export type LaunchDiscovery = {
  venues: LaunchVenue[]
  x402: X402Info
  acp: AcpInfo
}

let inflightDiscovery: Promise<LaunchDiscovery> | null = null

async function fetchLaunchDiscoveryUncached(): Promise<LaunchDiscovery> {
  const bases = [CREW_AGENT_API_URL.replace(/\/$/, ''), CREW_PUBLIC_API_URL]
  let x402 = FALLBACK_X402
  let acp = FALLBACK_ACP
  for (const base of [...new Set(bases)]) {
    try {
      const payload = await getJson(`${base}/api/platforms`)
      x402 = x402FromDoc(payload)
      acp = acpFromDoc(payload)
      const fromPayload = venuesFromPlatformsPayload(payload)
      if (fromPayload) return { venues: fromPayload, x402, acp }
    } catch {
      /* try discovery */
    }
    try {
      const discovery = await getJson(`${base}/api/agent`)
      x402 = x402FromDoc(discovery)
      acp = acpFromDoc(discovery)
      const fromDiscovery = venuesFromDiscovery(discovery)
      if (fromDiscovery) return { venues: fromDiscovery, x402, acp }
    } catch {
      /* try openapi */
    }
    try {
      const openapi = await getJson(`${base}/openapi.json`)
      const fromSpec = venuesFromOpenApi(openapi)
      if (fromSpec) return { venues: fromSpec, x402, acp }
    } catch {
      /* next base */
    }
  }
  return { venues: FALLBACK_LAUNCH_VENUES, x402, acp }
}

/**
 * Read venues + x402 from GET /api/platforms, then GET /api/agent, then OpenAPI enum.
 * Never throws — venues fallback keeps Zora off; x402 fallback is $0.10 / $0.02 USDC.
 */
export function fetchLaunchDiscovery(): Promise<LaunchDiscovery> {
  if (inflightDiscovery) return inflightDiscovery
  inflightDiscovery = fetchLaunchDiscoveryUncached().finally(() => {
    inflightDiscovery = null
  })
  return inflightDiscovery
}

/**
 * Read supported venues from GET /api/platforms, then GET /api/agent, then OpenAPI enum.
 * Never throws — always returns a three-venue list. Fallback keeps Zora off.
 */
export async function fetchLaunchVenues(): Promise<LaunchVenue[]> {
  return (await fetchLaunchDiscovery()).venues
}

export function unsignedLaunchCurl(opts: {
  platform: LaunchPlatform
  name?: string
  ticker?: string
  description?: string
  auth?: 'key' | 'x402'
  paymentHeader?: string
  launcherPubkey?: string | null
}): string {
  const name = (opts.name || 'Desk Cat').slice(0, 32)
  const ticker = (opts.ticker || 'DCAT').slice(0, 13)
  const description = (opts.description || 'ai agent hires kols').slice(0, 204)
  const authHeader =
    opts.auth === 'x402'
      ? `-H "${opts.paymentHeader || 'X-PAYMENT'}: $X402_PAYMENT" \\`
      : `-H "x-crew-api-key: $CREW_AGENT_API_KEY" \\`
  const fallback =
    opts.platform === 'zora' || opts.platform === 'clanker' || opts.platform === 'vibevibe'
      ? '0xYOUR_EVM_PUBKEY'
      : 'YOUR_SOLANA_PUBKEY'
  const launcher = (opts.launcherPubkey || '').trim() || fallback
  return `curl -sS ${CREW_PUBLIC_API_URL}/api/agent/launch/unsigned \\
  -H "content-type: application/json" \\
  ${authHeader}
  -d '{
    "platform": "${opts.platform}",
    "name": ${JSON.stringify(name)},
    "ticker": ${JSON.stringify(ticker)},
    "description": ${JSON.stringify(description)},
    "mode": "agent",
    "imageUrl": "https://example.com/cat.png",
    "launcherPubkey": "${launcher}",
    "autoHire": { "seats": 5 }
  }'`
}
