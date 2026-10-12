import { assertEvmAddress, isEvmAddress } from './evm-address.js'
import { PUMP_MAX_SHAREHOLDERS } from './constants.js'

export const LAUNCH_PLATFORMS = ['pumpfun', 'bags', 'zora'] as const
export type LaunchPlatform = (typeof LAUNCH_PLATFORMS)[number]

export const DEFAULT_LAUNCH_PLATFORM: LaunchPlatform = 'pumpfun'

/** Bags fee-share v2 hard cap (docs.bags.fm). */
export const BAGS_MAX_CLAIMERS = 100
/** LUT required above this many claimers (Bags fee-share config OpenAPI). */
export const BAGS_MAX_CLAIMERS_NON_LUT = 7
export const BAGS_PUBLIC_LUT = 'Eq1EVs15EAWww1YtPTtWPzJRLPJoS6VYP9oW9SbNr3yp'
export const BAGS_API_BASE_DEFAULT = 'https://public-api-v2.bags.fm/api/v1'
export const BAGS_COIN_URL = (mint: string) => `https://bags.fm/${mint}`

export const ZORA_FACTORY = '0x777777751622c0d3258f214F9DF38E35BF45baF3'
/** 0xSplits PullSplitFactory V2.2 (Base + Base Sepolia). */
export const SPLITS_PULL_FACTORY_V2 = '0x6B9118074aB15142d7524E8c4ea8f62A3Bdb98f1'
export const ZORA_CHAIN_IDS = { base: 8453, 'base-sepolia': 84532 } as const
export type ZoraNetwork = keyof typeof ZORA_CHAIN_IDS

export function parseLaunchPlatform(raw?: string | null): LaunchPlatform {
  const v = (raw || DEFAULT_LAUNCH_PLATFORM).trim().toLowerCase()
  if (v === 'pump' || v === 'pump.fun' || v === 'pumpfun') return 'pumpfun'
  if (v === 'bags' || v === 'bags.fm' || v === 'bagsfm') return 'bags'
  if (v === 'zora' || v === 'zora-coins' || v === 'zoracoins') return 'zora'
  throw new Error(`Unknown launch platform "${raw}". Use pumpfun (default), bags, or zora.`)
}

export function bagsApiKey(): string {
  return (process.env.BAGS_API_KEY || '').trim()
}

export function bagsApiBase(): string {
  return (process.env.BAGS_API_URL || BAGS_API_BASE_DEFAULT).replace(/\/$/, '')
}

export function assertBagsEnabled(): string {
  const key = bagsApiKey()
  if (!key) {
    throw new Error(
      'Bags.fm launches are disabled — set BAGS_API_KEY (public API key from https://dev.bags.fm).',
    )
  }
  return key
}

export function zoraEnabled(): boolean {
  const v = (process.env.ZORA_ENABLED || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export function evmTreasuryConfigured(): boolean {
  const w = (
    process.env.ZORA_TREASURY_ADDRESS ||
    process.env.CREW_BUYBACK_WALLET_EVM ||
    ''
  ).trim()
  return isEvmAddress(w)
}

/** Live for discovery/UI: flag on and a 0x treasury address configured. */
export function zoraReady(): boolean {
  return zoraEnabled() && evmTreasuryConfigured()
}

export function assertZoraEnabled(): void {
  if (!zoraEnabled()) {
    throw new Error(
      'Zora coin launches are disabled — set ZORA_ENABLED=1 to enable (Base Sepolia for tests, Base mainnet via ZORA_CHAIN).',
    )
  }
  if (!evmTreasuryConfigured()) {
    throw new Error(
      'Zora coin launches need ZORA_TREASURY_ADDRESS or CREW_BUYBACK_WALLET_EVM (0x… treasury for 0xSplits).',
    )
  }
}

export function zoraNetwork(): ZoraNetwork {
  const raw = (process.env.ZORA_CHAIN || process.env.ZORA_NETWORK || '').trim().toLowerCase()
  if (!raw || raw === 'base-sepolia' || raw === 'sepolia' || raw === '84532') return 'base-sepolia'
  if (raw === 'base' || raw === 'base-mainnet' || raw === '8453') return 'base'
  throw new Error(`Unknown ZORA_CHAIN "${raw}". Use base or base-sepolia.`)
}

export function zoraChainId(): number {
  return ZORA_CHAIN_IDS[zoraNetwork()]
}

export function zoraRpcUrl(): string {
  const explicit = (process.env.ZORA_RPC_URL || process.env.BASE_RPC_URL || '').trim()
  if (explicit) return explicit
  return zoraNetwork() === 'base' ? 'https://mainnet.base.org' : 'https://sepolia.base.org'
}

export function zoraCoinUrl(address: string, network: ZoraNetwork = zoraNetwork()): string {
  const chain = network === 'base' ? 'base' : 'base-sepolia'
  return `https://zora.co/coin/${chain}:${address}`
}

export function getEvmTreasuryWallet(): string {
  const w = (
    process.env.ZORA_TREASURY_ADDRESS ||
    process.env.CREW_BUYBACK_WALLET_EVM ||
    ''
  ).trim()
  if (!isEvmAddress(w)) {
    throw new Error(
      'Set ZORA_TREASURY_ADDRESS or CREW_BUYBACK_WALLET_EVM (0x… treasury for Zora / 0xSplits).',
    )
  }
  return assertEvmAddress(w, 'treasury')
}

/** CrewPay as Zora platform referrer (20% of protocol trade fees — separate from creator split). */
export function getZoraPlatformReferrer(): string {
  const w = (process.env.ZORA_PLATFORM_REFERRER || '').trim()
  if (w) return assertEvmAddress(w, 'platformReferrer')
  return getEvmTreasuryWallet()
}

export function getSplitsFactory(): string {
  const w = (process.env.ZORA_SPLIT_FACTORY || '').trim()
  if (w) return assertEvmAddress(w, 'splitFactory')
  return SPLITS_PULL_FACTORY_V2
}

export function maxClaimersForPlatform(platform: LaunchPlatform): number {
  if (platform === 'bags') return BAGS_MAX_CLAIMERS
  if (platform === 'zora') return 100
  return PUMP_MAX_SHAREHOLDERS
}

export function assertPlatformReady(platform: LaunchPlatform): void {
  if (platform === 'bags') assertBagsEnabled()
  if (platform === 'zora') assertZoraEnabled()
}

export function platformDisplayName(platform: LaunchPlatform): string {
  if (platform === 'bags') return 'Bags.fm'
  if (platform === 'zora') return 'Zora'
  return 'Pump.fun'
}

export type LaunchVenueStatus = 'live' | 'testnet' | 'disabled'
export type LaunchChain = 'solana' | 'base' | 'base-sepolia'

/** Public discovery row — no secrets. UI reads this instead of hardcoding venues. */
export type LaunchVenue = {
  id: LaunchPlatform
  name: string
  chain: LaunchChain
  enabled: boolean
  status: LaunchVenueStatus
  /** Short UI caption: Zora is "Base" / "testnet" / "soon". */
  caption?: string
  tradeHost: string
  explorer: 'solscan' | 'basescan'
  note: string
}

export function zoraCaption(enabled: boolean, chain: LaunchChain): string {
  if (!enabled) return 'soon'
  return chain === 'base' ? 'Base' : 'testnet'
}

export function listLaunchVenues(): LaunchVenue[] {
  const bagsOn = Boolean(bagsApiKey())
  const zoraOn = zoraReady()
  let zoraNet: ZoraNetwork = 'base-sepolia'
  try {
    zoraNet = zoraNetwork()
  } catch {
    zoraNet = 'base-sepolia'
  }
  const zoraChain: LaunchChain = zoraNet
  return [
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
      enabled: bagsOn,
      status: bagsOn ? 'live' : 'disabled',
      caption: bagsOn ? undefined : 'soon',
      tradeHost: 'bags.fm',
      explorer: 'solscan',
      note: 'Unsigned Solana fee-claimer launches. Requires BAGS_API_KEY.',
    },
    {
      id: 'zora',
      name: 'Zora',
      chain: zoraChain,
      enabled: zoraOn,
      status: zoraOn ? (zoraNet === 'base' ? 'live' : 'testnet') : 'disabled',
      caption: zoraCaption(zoraOn, zoraChain),
      tradeHost: 'zora.co',
      explorer: 'basescan',
      note: zoraOn
        ? `Zora content coins on ${zoraNet === 'base' ? 'Base' : 'Base Sepolia'}. Crew wallets must be EVM (0x…).`
        : zoraEnabled()
          ? 'ZORA_ENABLED is on but treasury address is missing (ZORA_TREASURY_ADDRESS or CREW_BUYBACK_WALLET_EVM).'
          : 'Off unless ZORA_ENABLED and a 0x treasury are set. Base Sepolia default. Crew wallets must be EVM (0x…).',
    },
  ]
}

/** Dedicated public payload for GET /api/platforms (also embedded on GET /api/agent). */
export function platformsPublicJson() {
  return {
    ok: true as const,
    default: DEFAULT_LAUNCH_PLATFORM,
    feeMap: LAUNCH_FEE_MAP_COPY,
    venues: listLaunchVenues(),
  }
}

/** Infer venue from a stored trade URL or mint (0x = Zora). */
export function inferLaunchPlatformFromCoin(opts: {
  pumpUrl?: string | null
  mint?: string | null
  platform?: string | null
}): LaunchPlatform {
  if (opts.platform) {
    try {
      return parseLaunchPlatform(opts.platform)
    } catch {
      /* fall through */
    }
  }
  const url = (opts.pumpUrl || '').toLowerCase()
  if (url.includes('bags.fm')) return 'bags'
  if (url.includes('zora.co') || url.includes('zora.energy')) return 'zora'
  const mint = (opts.mint || '').trim()
  if (isEvmAddress(mint)) return 'zora'
  return 'pumpfun'
}

export function tradeUrlForPlatform(platform: LaunchPlatform, mint: string): string {
  if (platform === 'bags') return BAGS_COIN_URL(mint)
  if (platform === 'zora') return zoraCoinUrl(mint)
  return `https://pump.fun/coin/${mint}`
}

export function explorerTokenUrl(platform: LaunchPlatform, mint: string): string {
  if (platform === 'zora') {
    const net = (() => {
      try {
        return zoraNetwork()
      } catch {
        return 'base-sepolia' as ZoraNetwork
      }
    })()
    const host = net === 'base' ? 'https://basescan.org' : 'https://sepolia.basescan.org'
    return `${host}/token/${mint}`
  }
  return `https://solscan.io/token/${mint}`
}

export function explorerTxUrl(platform: LaunchPlatform, signature: string): string {
  if (platform === 'zora') {
    const net = (() => {
      try {
        return zoraNetwork()
      } catch {
        return 'base-sepolia' as ZoraNetwork
      }
    })()
    const host = net === 'base' ? 'https://basescan.org' : 'https://sepolia.basescan.org'
    return `${host}/tx/${signature}`
  }
  return `https://solscan.io/tx/${signature}`
}

export const LAUNCH_FEE_MAP_COPY =
  '60% hired KOL crew / 15% launching agent / rest treasury'

const TRADE_HOSTS: Record<LaunchPlatform, string[]> = {
  pumpfun: ['pump.fun', 'www.pump.fun'],
  bags: ['bags.fm', 'www.bags.fm'],
  zora: ['zora.co', 'www.zora.co'],
}

export function isAllowedTradeHost(hostname: string, platform?: LaunchPlatform): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (platform) return TRADE_HOSTS[platform].includes(host)
  return Object.values(TRADE_HOSTS).some((hosts) => hosts.includes(host))
}
