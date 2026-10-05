import { assertSafeRpcUrl } from './security'

export const CREW_VERSION = '2.4.0'

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
 */
export const MODE_DESK_BPS = {
  split: 0,
  buyback: 2000,
  raid: 2500,
  agent: 1500,
} as const

export const MAX_CREW = 5
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
