export const CREW_VERSION = '1.1.0'

/** Default public RPC — override with VITE_RPC_URL for production throughput. */
export const RPC_URL =
  (import.meta.env.VITE_RPC_URL as string | undefined)?.trim() ||
  'https://api.mainnet-beta.solana.com'

export const CLUSTER = (import.meta.env.VITE_CLUSTER as string | undefined)?.trim() || 'mainnet-beta'

export const PUMP_IPFS_URL = 'https://pump.fun/api/ipfs'
export const PUMP_COIN_URL = (mint: string) => `https://pump.fun/coin/${mint}`

/** Desk reserve cut for buyback / raid modes (bps of total creator fees). */
export const MODE_DESK_BPS = {
  split: 0,
  buyback: 2000,
  raid: 2500,
} as const

export const MAX_CREW = 5
export const STORE_KEY = 'crew.platform.v2'
