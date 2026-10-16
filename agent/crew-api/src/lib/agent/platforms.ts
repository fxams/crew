import { assertEvmAddress, isEvmAddress } from './evm-address.js'
import { assertSuiAddress, isSuiAddress } from './sui-address.js'
import { PUMP_MAX_SHAREHOLDERS } from './constants.js'
import { x402PublicDiscovery } from '../x402.js'

export const LAUNCH_PLATFORMS = ['pumpfun', 'bags', 'zora', 'clanker', 'vibevibe', 'sui'] as const
export type LaunchPlatform = (typeof LAUNCH_PLATFORMS)[number]

export const DEFAULT_LAUNCH_PLATFORM: LaunchPlatform = 'pumpfun'

/** Bags fee-share v2 hard cap (docs.bags.fm). */
export const BAGS_MAX_CLAIMERS = 100
/** LUT required above this many claimers (Bags fee-share config OpenAPI). */
export const BAGS_MAX_CLAIMERS_NON_LUT = 7
export const BAGS_PUBLIC_LUT = 'Eq1EVs15EAWww1YtPTtWPzJRLPJoS6VYP9oW9SbNr3yp'
/** Default Meteora/Bags config type — @bagsfm/bags-sdk always sends this on POST /fee-share/config. */
export const BAGS_DEFAULT_CONFIG_TYPE = 'fa29606e-5e48-4c37-827f-4b03d58ee23d'
/** Config creation funds deployer accounts; Bags simulates against payer SOL (~0.05 SOL). */
export const BAGS_MIN_FEE_SHARE_SOL = 0.05
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
  if (v === 'clanker' || v === 'clanker.world') return 'clanker'
  if (v === 'vibevibe' || v === 'vibe' || v === 'vibe-vibe' || v === 'vibevibe.fun') return 'vibevibe'
  if (v === 'sui' || v === 'memez' || v === 'memez.gg' || v === 'blast' || v === 'blast.fun') return 'sui'
  throw new Error(
    `Unknown launch platform "${raw}". Use pumpfun (default), bags, zora, clanker, vibevibe, or sui.`,
  )
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
    process.env.CLANKER_TREASURY_ADDRESS ||
    process.env.ZORA_TREASURY_ADDRESS ||
    process.env.CREW_BUYBACK_WALLET_EVM ||
    ''
  ).trim()
  return isEvmAddress(w)
}

/** Clanker readiness treasury — prefers CLANKER_TREASURY_ADDRESS, then Zora/buyback fallbacks. */
export function clankerTreasuryConfigured(): boolean {
  const w = (
    process.env.CLANKER_TREASURY_ADDRESS ||
    process.env.ZORA_TREASURY_ADDRESS ||
    process.env.CREW_BUYBACK_WALLET_EVM ||
    ''
  ).trim()
  return isEvmAddress(w)
}

export function vibevibeTreasuryConfigured(): boolean {
  const w = (
    process.env.VIBEVIBE_TREASURY_ADDRESS ||
    process.env.CLANKER_TREASURY_ADDRESS ||
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

export function clankerEnabled(): boolean {
  const v = (process.env.CLANKER_ENABLED || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export function clankerReady(): boolean {
  return clankerEnabled() && clankerTreasuryConfigured()
}

export function vibevibeEnabled(): boolean {
  const v = (process.env.VIBEVIBE_ENABLED || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export function vibevibeReady(): boolean {
  return vibevibeEnabled() && vibevibeTreasuryConfigured()
}

export function suiEnabled(): boolean {
  const v = (process.env.SUI_ENABLED || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export function suiTreasuryConfigured(): boolean {
  const w = (process.env.SUI_TREASURY_ADDRESS || '').trim()
  return isSuiAddress(w)
}

export function suiReady(): boolean {
  return suiEnabled() && suiTreasuryConfigured()
}

export type SuiNetwork = 'testnet'

/** Testnet-only for this rail — never defaults to mainnet. */
export function suiNetwork(): SuiNetwork {
  const raw = (process.env.SUI_NETWORK || 'testnet').trim().toLowerCase()
  if (!raw || raw === 'testnet') return 'testnet'
  if (raw === 'mainnet') {
    throw new Error('Sui Memez launch rail is testnet-only — SUI_NETWORK=mainnet is not supported yet.')
  }
  throw new Error(`Unknown SUI_NETWORK "${raw}". Use testnet (default).`)
}

export function suiRpcUrl(): string {
  const explicit = (process.env.SUI_RPC_URL || '').trim()
  if (explicit) return explicit
  return 'https://fullnode.testnet.sui.io:443'
}

export function memezCustomConfigActive(): boolean {
  return Boolean((process.env.MEMEZ_CONFIG_KEY || '').trim())
}

export function getSuiTreasuryWallet(): string {
  const w = (process.env.SUI_TREASURY_ADDRESS || '').trim()
  if (!isSuiAddress(w)) {
    throw new Error('Set SUI_TREASURY_ADDRESS (0x… Sui treasury in the Memez fee map).')
  }
  return assertSuiAddress(w, 'treasury')
}

export function assertSuiEnabled(): void {
  if (!suiEnabled()) {
    throw new Error(
      'Sui Memez launches are disabled — set SUI_ENABLED=1 (Sui testnet / Memez.gg by default).',
    )
  }
  suiNetwork()
  if (!suiTreasuryConfigured()) {
    throw new Error('Sui Memez launches need SUI_TREASURY_ADDRESS (0x… treasury in the fee map).')
  }
}

export function assertVibevibeEnabled(): void {
  if (!vibevibeEnabled()) {
    throw new Error(
      'vibe/vibe launches are disabled — set VIBEVIBE_ENABLED=1 (Robinhood Chain testnet by default).',
    )
  }
  if (!vibevibeTreasuryConfigured()) {
    throw new Error(
      'vibe/vibe launches need VIBEVIBE_TREASURY_ADDRESS or CLANKER_TREASURY_ADDRESS (0x… treasury in the fee map).',
    )
  }
}

export function assertClankerEnabled(): void {
  if (!clankerEnabled()) {
    throw new Error(
      'Clanker launches are disabled — set CLANKER_ENABLED=1 to enable (Base Sepolia for tests, Base mainnet via CLANKER_CHAIN).',
    )
  }
  if (!clankerTreasuryConfigured()) {
    throw new Error(
      'Clanker launches need CLANKER_TREASURY_ADDRESS, ZORA_TREASURY_ADDRESS, or CREW_BUYBACK_WALLET_EVM (0x… treasury in the fee map).',
    )
  }
}

export type ClankerNetwork = ZoraNetwork

export function clankerNetwork(): ClankerNetwork {
  const raw = (process.env.CLANKER_CHAIN || process.env.CLANKER_NETWORK || '').trim().toLowerCase()
  if (!raw) return 'base-sepolia'
  if (raw === 'base-sepolia' || raw === 'sepolia' || raw === '84532') return 'base-sepolia'
  if (raw === 'base' || raw === 'base-mainnet' || raw === '8453') return 'base'
  throw new Error(`Unknown CLANKER_CHAIN "${raw}". Use base or base-sepolia.`)
}

export function clankerChainId(): number {
  return ZORA_CHAIN_IDS[clankerNetwork()]
}

export function clankerRpcUrl(): string {
  const clankerExplicit = (process.env.CLANKER_RPC_URL || '').trim()
  if (clankerExplicit) return clankerExplicit
  const net = clankerNetwork()
  if (net === 'base') {
    const baseRpc = (process.env.BASE_RPC_URL || '').trim()
    return baseRpc || 'https://mainnet.base.org'
  }
  return 'https://sepolia.base.org'
}

export function clankerCoinUrl(address: string, network: ClankerNetwork = clankerNetwork()): string {
  const addr = assertEvmAddress(address)
  if (network === 'base') {
    return `https://clanker.world/clanker/${addr}`
  }
  return `https://sepolia.basescan.org/token/${addr}#clanker`
}

export const VIBEVIBE_CHAIN_IDS = { 'robinhood-testnet': 46630, robinhood: 46630 } as const
export type VibevibeNetwork = keyof typeof VIBEVIBE_CHAIN_IDS

export function vibevibeNetwork(): VibevibeNetwork {
  const raw = (process.env.VIBEVIBE_CHAIN || process.env.VIBEVIBE_NETWORK || '').trim().toLowerCase()
  if (!raw || raw === 'robinhood-testnet' || raw === 'testnet' || raw === '46630') {
    return 'robinhood-testnet'
  }
  if (raw === 'robinhood' || raw === 'mainnet') {
    return 'robinhood'
  }
  throw new Error(`Unknown VIBEVIBE_CHAIN "${raw}". Use robinhood-testnet (default) or robinhood.`)
}

export function vibevibeChainId(): number {
  return VIBEVIBE_CHAIN_IDS[vibevibeNetwork()]
}

export function vibevibeRpcUrl(): string {
  const explicit = (process.env.VIBEVIBE_RPC_URL || '').trim()
  if (explicit) return explicit
  return 'https://rpc.testnet.chain.robinhood.com/rpc'
}

const VIBEVIBE_FACTORY_DEFAULT = '0xe794217880011f9cA6961340eD5c16EC9559Fea0'

export function vibevibeFactoryAddress(): string {
  const w = (process.env.VIBEVIBE_FACTORY_ADDRESS || VIBEVIBE_FACTORY_DEFAULT).trim()
  return assertEvmAddress(w, 'factory')
}

export function vibevibeCoinUrl(address: string, network: VibevibeNetwork = vibevibeNetwork()): string {
  const addr = assertEvmAddress(address)
  if (network === 'robinhood') {
    return `https://vibevibe.fun/token/${addr}`
  }
  return `https://testnet.vibevibe.fun/token/${addr}`
}

export function vibevibeExplorerBase(network: VibevibeNetwork = vibevibeNetwork()): string {
  return 'https://explorer.testnet.chain.robinhood.com'
}

export function isEvmLaunchPlatform(platform: LaunchPlatform): boolean {
  return platform === 'zora' || platform === 'clanker' || platform === 'vibevibe'
}

export function isSuiLaunchPlatform(platform: LaunchPlatform): boolean {
  return platform === 'sui'
}

export function evmLaunchRpcUrl(platform: LaunchPlatform): string {
  if (platform === 'clanker') return clankerRpcUrl()
  if (platform === 'vibevibe') return vibevibeRpcUrl()
  return zoraRpcUrl()
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
    process.env.CLANKER_TREASURY_ADDRESS ||
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

/** Treasury seat in the CrewPay fee map — platform-specific env fallbacks. */
export function getTreasuryWalletForPlatform(platform: LaunchPlatform): string {
  if (platform === 'sui') {
    return getSuiTreasuryWallet()
  }
  if (platform === 'vibevibe') {
    const w = (
      process.env.VIBEVIBE_TREASURY_ADDRESS ||
      process.env.CLANKER_TREASURY_ADDRESS ||
      process.env.ZORA_TREASURY_ADDRESS ||
      process.env.CREW_BUYBACK_WALLET_EVM ||
      ''
    ).trim()
    if (!isEvmAddress(w)) {
      throw new Error(
        'Set VIBEVIBE_TREASURY_ADDRESS or CLANKER_TREASURY_ADDRESS (0x… treasury in the vibe/vibe fee map).',
      )
    }
    return assertEvmAddress(w, 'treasury')
  }
  return getEvmTreasuryWallet()
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
  if (platform === 'zora' || platform === 'clanker' || platform === 'vibevibe' || platform === 'sui') {
    return 100
  }
  return PUMP_MAX_SHAREHOLDERS
}

export function assertPlatformReady(platform: LaunchPlatform): void {
  if (platform === 'bags') assertBagsEnabled()
  if (platform === 'zora') assertZoraEnabled()
  if (platform === 'clanker') assertClankerEnabled()
  if (platform === 'vibevibe') assertVibevibeEnabled()
  if (platform === 'sui') assertSuiEnabled()
}

export function platformDisplayName(platform: LaunchPlatform): string {
  if (platform === 'bags') return 'Bags.fm'
  if (platform === 'zora') return 'Zora'
  if (platform === 'clanker') return 'Clanker'
  if (platform === 'vibevibe') return 'vibe/vibe'
  if (platform === 'sui') return 'Memez.gg'
  return 'Pump.fun'
}

export type LaunchVenueStatus = 'live' | 'testnet' | 'disabled'
export type LaunchChain =
  | 'solana'
  | 'base'
  | 'base-sepolia'
  | 'robinhood-testnet'
  | 'robinhood'
  | 'sui-testnet'

/** Public discovery row — no secrets. UI reads this instead of hardcoding venues. */
export type LaunchVenue = {
  id: LaunchPlatform
  name: string
  chain: LaunchChain
  enabled: boolean
  status: LaunchVenueStatus
  /** Short UI caption: Zora is "Base" / "testnet" / "soon". Bags may be "recommended". */
  caption?: string
  /** Hint only — does not change \`platforms.default\` (still pumpfun). */
  recommended?: boolean
  tradeHost: string
  explorer: 'solscan' | 'basescan' | 'robinhood' | 'suiscan'
  note: string
}

export function zoraCaption(enabled: boolean, chain: LaunchChain): string {
  if (!enabled) return 'soon'
  return chain === 'base' ? 'Base' : 'testnet'
}

export function listLaunchVenues(): LaunchVenue[] {
  const bagsOn = Boolean(bagsApiKey())
  const suiFlag = suiEnabled()
  const suiOn = suiReady()
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
      caption: bagsOn ? 'recommended' : 'soon',
      recommended: true,
      tradeHost: 'bags.fm',
      explorer: 'solscan',
      note: 'Recommended Solana venue (API default stays pumpfun). Unsigned fee-claimer launches. Requires BAGS_API_KEY.',
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
    {
      id: 'clanker',
      name: 'Clanker',
      chain: (() => {
        try {
          return clankerNetwork()
        } catch {
          return 'base-sepolia' as LaunchChain
        }
      })(),
      enabled: clankerReady(),
      status: clankerReady()
        ? clankerNetwork() === 'base'
          ? 'live'
          : 'testnet'
        : 'disabled',
      caption:
        (() => {
          try {
            return clankerNetwork() === 'base' ? 'Base' : 'Base Sepolia (testnet)'
          } catch {
            return 'Base Sepolia (testnet)'
          }
        })(),
      tradeHost: 'clanker.world',
      explorer: 'basescan',
      note: clankerReady()
        ? `Clanker v4 on ${clankerNetwork() === 'base' ? 'Base' : 'Base Sepolia'}. Crew fee map encoded as reward recipients at launch. See docs/integrations/clanker.md for the protocol-fee gap.`
        : clankerEnabled()
          ? 'CLANKER_ENABLED is on but treasury address is missing (CLANKER_TREASURY_ADDRESS, ZORA_TREASURY_ADDRESS, or CREW_BUYBACK_WALLET_EVM).'
          : 'Off unless CLANKER_ENABLED=1 and a 0x treasury are set. Base Sepolia default for tests.',
    },
    {
      id: 'vibevibe',
      name: 'vibe/vibe',
      chain: (() => {
        try {
          return vibevibeNetwork()
        } catch {
          return 'robinhood-testnet' as LaunchChain
        }
      })(),
      enabled: vibevibeReady(),
      status: vibevibeReady()
        ? vibevibeNetwork() === 'robinhood'
          ? 'live'
          : 'testnet'
        : 'disabled',
      caption: (() => {
        try {
          return vibevibeNetwork() === 'robinhood' ? 'Robinhood Chain' : 'Robinhood Chain testnet'
        } catch {
          return 'Robinhood Chain testnet'
        }
      })(),
      tradeHost: 'testnet.vibevibe.fun',
      explorer: 'robinhood',
      note: vibevibeReady()
        ? `vibe/vibe bonding-curve launches on ${vibevibeNetwork() === 'robinhood' ? 'Robinhood Chain' : 'Robinhood Chain testnet'}. Crew wallets must be EVM (0x…). See docs/integrations/vibevibe.md for the on-chain fee gap.`
        : vibevibeEnabled()
          ? 'VIBEVIBE_ENABLED is on but treasury address is missing (VIBEVIBE_TREASURY_ADDRESS or CLANKER_TREASURY_ADDRESS).'
          : 'Off unless VIBEVIBE_ENABLED=1 and a 0x treasury are set. Robinhood Chain testnet default.',
    },
    ...(suiFlag
      ? [
          {
            id: 'sui' as const,
            name: 'Memez.gg',
            chain: 'sui-testnet' as LaunchChain,
            enabled: suiOn,
            status: (suiOn ? 'testnet' : 'disabled') as LaunchVenueStatus,
            caption: 'Sui testnet',
            tradeHost: 'testnet.blast.fun',
            explorer: 'suiscan' as const,
            note: suiOn
              ? 'Memez.gg / Blast.fun pump launches on Sui testnet. Two unsigned steps: publish coin, then create pool. Set MEMEZ_CONFIG_KEY when Interest Protocol registers CrewPay integrator fees.'
              : 'SUI_ENABLED is on but SUI_TREASURY_ADDRESS is missing (0x… treasury in the fee map).',
          },
        ]
      : []),
  ]
}

const ACP_OFFERING_IDS = ['crewpay_autohire_kol_crew', 'crewpay_launch_with_crew'] as const

export const DEFAULT_ACP_PRICE_AUTOHIRE_USD = 0.25
export const DEFAULT_ACP_PRICE_LAUNCH_USD = 1

export function acpEnabled(): boolean {
  const v = (process.env.ACP_ENABLED || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

/** Default Base Sepolia (84532). Never reads ACP_SIGNER_KEY. */
export function acpChainId(): number {
  const raw = (process.env.ACP_CHAIN_ID || '').trim()
  if (!raw) return 84532
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Unknown ACP_CHAIN_ID "${raw}". Use 84532 (Base Sepolia) or 8453 (Base).`)
  }
  return n
}

export function acpChainLabel(chainId = (() => {
  try {
    return acpChainId()
  } catch {
    return 84532
  }
})()): 'base' | 'base-sepolia' | `eip155:${number}` {
  if (chainId === 8453) return 'base'
  if (chainId === 84532) return 'base-sepolia'
  return `eip155:${chainId}`
}

function acpPriceUsd(envName: string, fallback: number): number {
  const raw = (process.env[envName] || '').trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** Public ACP discovery — no secrets. */
export function acpPublicJson() {
  let chainId = 84532
  try {
    chainId = acpChainId()
  } catch {
    chainId = 84532
  }
  return {
    id: 'acp' as const,
    name: 'Virtuals ACP',
    protocol: 'acp-v2',
    href: 'https://app.virtuals.io/acp',
    enabled: acpEnabled(),
    chainId,
    chain: acpChainLabel(chainId),
    offerings: [...ACP_OFFERING_IDS],
    pricesUsd: {
      crewpay_autohire_kol_crew: acpPriceUsd('ACP_PRICE_AUTOHIRE_USD', DEFAULT_ACP_PRICE_AUTOHIRE_USD),
      crewpay_launch_with_crew: acpPriceUsd('ACP_PRICE_LAUNCH_USD', DEFAULT_ACP_PRICE_LAUNCH_USD),
    },
    feeMap: LAUNCH_FEE_MAP_COPY,
    note: acpEnabled()
      ? 'Hire CrewPay via Virtuals ACP v2 jobs. Listens when ACP_ENABLED=1 (ACP_INPROCESS=1 embeds the listener in crewpay-api). Non-custodial launch stays unsigned.'
      : 'Off unless ACP_ENABLED=1. Set ACP_INPROCESS=1 on crewpay-api to listen in-process, or run services/acp-provider.',
  }
}

/** Dedicated public payload for GET /api/platforms (also embedded on GET /api/agent). */
export function platformsPublicJson() {
  return {
    ok: true as const,
    default: DEFAULT_LAUNCH_PLATFORM,
    feeMap: LAUNCH_FEE_MAP_COPY,
    venues: listLaunchVenues(),
    acp: acpPublicJson(),
    x402: x402PublicDiscovery(),
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
  if (url.includes('clanker.world') || url.includes('#clanker')) return 'clanker'
  if (url.includes('vibevibe.fun')) return 'vibevibe'
  if (url.includes('blast.fun') || url.includes('memez.gg')) return 'sui'
  const mint = (opts.mint || '').trim()
  if (isEvmAddress(mint)) return 'zora'
  return 'pumpfun'
}

export function tradeUrlForPlatform(platform: LaunchPlatform, mint: string): string {
  if (platform === 'bags') return BAGS_COIN_URL(mint)
  if (platform === 'zora') return zoraCoinUrl(mint)
  if (platform === 'clanker') return clankerCoinUrl(mint)
  if (platform === 'vibevibe') return vibevibeCoinUrl(mint)
  if (platform === 'sui') return suiCoinUrl(mint)
  return `https://pump.fun/coin/${mint}`
}

export function suiCoinUrl(objectOrCoin: string): string {
  const id = (objectOrCoin || '').trim()
  if (!id) return 'https://testnet.blast.fun'
  return `https://testnet.blast.fun/coin/${id}`
}

export function explorerTokenUrl(platform: LaunchPlatform, mint: string): string {
  if (platform === 'sui') {
    return `https://suiscan.xyz/testnet/object/${assertSuiAddress(mint, 'mint')}`
  }
  if (platform === 'vibevibe') {
    const base = vibevibeExplorerBase()
    return `${base}/token/${assertEvmAddress(mint)}`
  }
  if (platform === 'zora' || platform === 'clanker') {
    const net = (() => {
      try {
        return platform === 'clanker' ? clankerNetwork() : zoraNetwork()
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
  if (platform === 'sui') {
    return `https://suiscan.xyz/testnet/tx/${signature}`
  }
  if (platform === 'vibevibe') {
    return `${vibevibeExplorerBase()}/tx/${signature}`
  }
  if (platform === 'zora' || platform === 'clanker') {
    const net = (() => {
      try {
        return platform === 'clanker' ? clankerNetwork() : zoraNetwork()
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
  '60% to the KOL crew, 15% to the launching agent, 25% to the treasury'

const TRADE_HOSTS: Record<LaunchPlatform, string[]> = {
  pumpfun: ['pump.fun', 'www.pump.fun'],
  bags: ['bags.fm', 'www.bags.fm'],
  zora: ['zora.co', 'www.zora.co'],
  clanker: ['clanker.world', 'www.clanker.world'],
  vibevibe: ['testnet.vibevibe.fun', 'vibevibe.fun', 'www.vibevibe.fun'],
  sui: ['blast.fun', 'www.blast.fun', 'testnet.blast.fun', 'memez.gg', 'www.memez.gg'],
}

export function isAllowedTradeHost(hostname: string, platform?: LaunchPlatform): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (platform) return TRADE_HOSTS[platform].includes(host)
  return Object.values(TRADE_HOSTS).some((hosts) => hosts.includes(host))
}
