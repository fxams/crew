export const MAX_CREW = 10
export const PLATFORM_BUYBACK_BPS = 2500
export const MODE_DESK_BPS = {
  split: 0,
  buyback: 2000,
  raid: 2500,
  agent: 1500,
} as const

export const CREW_LAUNCH_ATTRIBUTION = 'Launched from CrewPay.dev platform'
export const USER_DESCRIPTION_MAX = 240
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
  if (trimmed.includes(CREW_LAUNCH_ATTRIBUTION)) return trimmed.slice(0, 280)
  const sep = trimmed.endsWith('.') ? ' ' : '. '
  return `${trimmed}${sep}${CREW_LAUNCH_ATTRIBUTION}`.slice(0, 280)
}

export function rpcUrl(): string {
  return (
    process.env.RPC_URL?.trim() ||
    process.env.VITE_RPC_URL?.trim() ||
    'https://solana-rpc.publicnode.com'
  )
}
