export const MAX_CREW = 10
/** Cap agent initial buys — confused agents should not dump large wallets. */
export const MAX_INITIAL_BUY_SOL = 10
/** Minimum SOL left for create + fee-share txs beyond the initial buy. */
export const MIN_LAUNCH_FEE_SOL = 0.02
export const PLATFORM_BUYBACK_BPS = 2500
/** Direct referral cut: 5% of the referred KOL's seat (not of total fees). */
export const REFERRAL_CUT_BPS = 500
/** Pump fee-share configs allow at most this many unique wallets. */
export const PUMP_MAX_SHAREHOLDERS = 10
export const MODE_DESK_BPS = {
  split: 0,
  buyback: 2000,
  raid: 2500,
  agent: 1500,
} as const

export const CREW_LAUNCH_ATTRIBUTION = 'Launched from CrewPay.dev platform'
/** Final on-chain / IPFS description hard cap (Pump metadata). */
export const DESCRIPTION_HARD_MAX = 240
/** Max separator before attribution (". " or "\\n\\n"). */
export const ATTRIBUTION_SEP_MAX = 2
/**
 * User-typed description max — leaves room for separator + {@link CREW_LAUNCH_ATTRIBUTION}
 * so the final vibe never exceeds {@link DESCRIPTION_HARD_MAX}.
 */
export const USER_DESCRIPTION_MAX =
  DESCRIPTION_HARD_MAX - CREW_LAUNCH_ATTRIBUTION.length - ATTRIBUTION_SEP_MAX
export const PUMP_IPFS_URL = 'https://pump.fun/api/ipfs'
export const PUMP_COIN_URL = (mint: string) => `https://pump.fun/coin/${mint}`

export type DeskMode = keyof typeof MODE_DESK_BPS
export type HireRole = 'caller' | 'chart' | 'raid' | 'kol' | 'dev'

export const HIRE_ROLES = new Set<HireRole>(['caller', 'chart', 'raid', 'kol', 'dev'])

export function equalShares(count: number): number[] {
  const n = Math.min(MAX_CREW, Math.max(1, Math.floor(count)))
  const base = Math.floor(100 / n)
  const rem = 100 - base * n
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0))
}

export function readPlatformBuybackWallet(): string {
  return (
    process.env.CREW_BUYBACK_WALLET?.trim() ||
    process.env.VITE_CREW_BUYBACK_WALLET?.trim() ||
    ''
  )
}

export function getPlatformBuybackWallet(): string {
  const w = readPlatformBuybackWallet()
  if (!w || w.length < 32) {
    throw new Error('Set CREW_BUYBACK_WALLET (Solana address for the 25% CREW buyback cut).')
  }
  return w
}

export function withCrewLaunchDescription(userVibe: string): string {
  const trimmed = userVibe.trim()
  if (!trimmed) return CREW_LAUNCH_ATTRIBUTION
  if (trimmed.includes(CREW_LAUNCH_ATTRIBUTION) || trimmed.toLowerCase().includes('crewpay.dev')) {
    return trimmed.slice(0, DESCRIPTION_HARD_MAX)
  }
  const sep = trimmed.endsWith('.') ? ' ' : '. '
  const combined = `${trimmed}${sep}${CREW_LAUNCH_ATTRIBUTION}`
  return combined.slice(0, DESCRIPTION_HARD_MAX)
}

export function rpcUrl(): string {
  return (
    process.env.RPC_URL?.trim() ||
    process.env.VITE_RPC_URL?.trim() ||
    'https://solana-rpc.publicnode.com'
  )
}
