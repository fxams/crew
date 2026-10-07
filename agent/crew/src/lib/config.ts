import { assertSafeRpcUrl } from './security'

export const CREW_VERSION = '2.5.11'

/** Official CREW / CrewPay HQ account on X. */
export const CREW_X_URL = 'https://x.com/CrewPayHQ'

/** Appended to every Pump metadata description on launch. */
export const CREW_LAUNCH_ATTRIBUTION = 'Launched from CrewPay.dev platform'

/** User-typed description max — leaves room for {@link CREW_LAUNCH_ATTRIBUTION}. */
export const USER_DESCRIPTION_MAX = 240

/**
 * Platform $CREW token — set after launch via env (or leave blank for hero placeholders).
 * `VITE_CREW_MINT` → contract address; buy link defaults to pump.fun/coin/{mint}.
 */
export const CREW_TOKEN_MINT =
  (import.meta.env.VITE_CREW_MINT as string | undefined)?.trim() || ''
export const CREW_TOKEN_PUMP_URL =
  (import.meta.env.VITE_CREW_PUMP_URL as string | undefined)?.trim() ||
  (CREW_TOKEN_MINT ? `https://pump.fun/coin/${CREW_TOKEN_MINT}` : 'https://pump.fun')
/** Optional live quotes — leave unset until an oracle / API is wired. */
export const CREW_TOKEN_PRICE_USD =
  (import.meta.env.VITE_CREW_PRICE_USD as string | undefined)?.trim() || ''
export const CREW_TOKEN_MCAP_USD =
  (import.meta.env.VITE_CREW_MCAP_USD as string | undefined)?.trim() || ''

/**
 * Public browser-safe mainnet RPCs.
 * Official `api.mainnet-beta.solana.com` returns 403 from many web origins (incl. GH Pages).
 */
export const DEFAULT_RPC_CANDIDATES = [
  'https://solana-rpc.publicnode.com',
  'https://solana.leorpc.com/?api_key=FREE',
  'https://api.mainnet-beta.solana.com',
] as const

const rawRpc = (import.meta.env.VITE_RPC_URL as string | undefined)?.trim()

/** Validated HTTPS RPC — set VITE_RPC_URL (Helius/Alchemy/etc.) for production reliability. */
export const RPC_URL = (() => {
  const preferred = rawRpc || DEFAULT_RPC_CANDIDATES[0]
  try {
    return assertSafeRpcUrl(preferred)
  } catch (err) {
    console.error(err)
    return DEFAULT_RPC_CANDIDATES[0]
  }
})()

/** Ordered failover list — preferred first, then other public candidates. */
export const RPC_FAILOVER = (() => {
  const seen = new Set<string>()
  const list: string[] = []
  for (const candidate of [RPC_URL, ...DEFAULT_RPC_CANDIDATES]) {
    try {
      const safe = assertSafeRpcUrl(candidate)
      if (seen.has(safe)) continue
      seen.add(safe)
      list.push(safe)
    } catch {
      /* skip invalid */
    }
  }
  return list.length ? list : [...DEFAULT_RPC_CANDIDATES]
})()

export const CLUSTER = (import.meta.env.VITE_CLUSTER as string | undefined)?.trim() || 'mainnet-beta'

export const PUMP_IPFS_URL = 'https://pump.fun/api/ipfs'
export const PUMP_COIN_URL = (mint: string) => `https://pump.fun/coin/${mint}`
/** Undocumented Pump frontend API — user profiles map username → wallet. */
export const PUMP_FRONTEND_API = 'https://frontend-api-v3.pump.fun'
/**
 * Read-only CORS proxy for GH Pages (Pump API only allows Origin: pump.fun).
 * Prefer allorigins `/get?url=` so upstream 404s are visible.
 * Override with VITE_PUMP_RESOLVE_PROXY if you host your own.
 */
export const PUMP_RESOLVE_PROXY =
  (import.meta.env.VITE_PUMP_RESOLVE_PROXY as string | undefined)?.trim() ||
  'https://api.allorigins.win/get?url='
export const SOLSCAN_TOKEN_URL = (mint: string) => `https://solscan.io/token/${mint}`
export const SOLSCAN_TX_URL = (sig: string) => `https://solscan.io/tx/${sig}`

/**
 * Desk reserve cut of total creator fees (bps).
 * Agent mode keeps 15% for agent ops (Agency-inspired) — paid to launcher, not burned.
 * These apply after the platform CREW buyback cut (see PLATFORM_BUYBACK_BPS).
 */
export const MODE_DESK_BPS = {
  split: 0,
  buyback: 2000,
  raid: 2500,
  agent: 1500,
} as const

/**
 * Permanent platform cut on every CREW launch — SOL fee-share to the buyback treasury.
 * That wallet later buys the CREW platform token on the open market (not auto-swapped by Pump).
 */
export const PLATFORM_BUYBACK_BPS = 2500

/**
 * On-chain fee-share recipient for the 25% CREW buyback cut.
 * Set `VITE_CREW_BUYBACK_WALLET` in Render / .env (must be a valid Solana address).
 * Read at call-time so tests / runtime env updates apply.
 */
export function readPlatformBuybackWallet(): string {
  return (import.meta.env.VITE_CREW_BUYBACK_WALLET as string | undefined)?.trim() || ''
}

/** @deprecated Use readPlatformBuybackWallet() — kept for sync config dumps. */
export const PLATFORM_BUYBACK_WALLET = readPlatformBuybackWallet()

export function getPlatformBuybackWallet(): string {
  const w = readPlatformBuybackWallet()
  if (!w || w.length < 32) {
    throw new Error(
      'Set VITE_CREW_BUYBACK_WALLET to the Solana treasury that receives 25% CREW buyback fees.',
    )
  }
  return w
}

/** Pump fee-share allows up to 10 recipients in the crew pool (plus platform/desk). */
export const MAX_CREW = 10

/** Ensure platform attribution is present on on-chain / IPFS descriptions. */
export function withCrewLaunchDescription(userDescription: string): string {
  const base = userDescription.trim()
  const marker = CREW_LAUNCH_ATTRIBUTION.toLowerCase()
  if (!base) return CREW_LAUNCH_ATTRIBUTION
  if (base.toLowerCase().includes(marker) || base.toLowerCase().includes('crewpay.dev')) {
    return base
  }
  return `${base}\n\n${CREW_LAUNCH_ATTRIBUTION}`
}
/** Board: launched coins + remit tape */
export const STORE_KEY = 'crew.platform.v4'
/** Older board keys — migrated once into STORE_KEY */
export const STORE_LEGACY_KEYS = [
  'crew.platform.v3',
  'crew.platform.v2',
  'crew.platform.v1',
  'crew.board.v1',
] as const
/** In-progress launch form (survives refresh) */
export const DRAFT_KEY = 'crew.draft.v1'
/** Lightweight UI prefs */
export const UI_KEY = 'crew.ui.v1'

export const AGENT_MODELS = [
  'Claude Sonnet',
  'Claude Opus',
  'GPT-5',
  'Gemini',
  'Grok',
  'custom',
] as const

export const HIRE_ROLE_OPTIONS = [
  { id: 'caller', label: 'Caller' },
  { id: 'chart', label: 'Chart' },
  { id: 'raid', label: 'Raid lead' },
  { id: 'kol', label: 'KOL' },
  { id: 'dev', label: 'Dev' },
] as const