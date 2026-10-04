import { assertSafeRpcUrl } from './security'

export const CREW_VERSION = '2.3.3'

const rawRpc =
  (import.meta.env.VITE_RPC_URL as string | undefined)?.trim() ||
  'https://api.mainnet-beta.solana.com'

/** Validated HTTPS RPC — override with VITE_RPC_URL for production throughput. */
export const RPC_URL = (() => {
  try {
    return assertSafeRpcUrl(rawRpc)
  } catch (err) {
    console.error(err)
    return 'https://api.mainnet-beta.solana.com'
  }
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
export const STORE_KEY = 'crew.platform.v4'

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
