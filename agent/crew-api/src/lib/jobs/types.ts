export type ChainId =
  | 'solana-devnet'
  | 'solana'
  | 'evm:base-sepolia'
  | 'evm:base'
  | 'evm:ethereum'

export type AssetSymbol = 'SOL' | 'USDC' | 'ETH' | 'USDT'

export type JobType = 'campaign'

export type JobStatus =
  | 'created'
  | 'funded'
  | 'open'
  | 'assigned'
  | 'submitted'
  | 'verified'
  | 'paid'
  | 'refunded'
  | 'closed'
  | 'expired'

export type CampaignRules = {
  requiredTicker?: string
  requiredLink?: string
  minPostAgeHours?: number
  platform?: 'x'
}

export type JobBase = {
  id: string
  type: JobType
  createdBy: string // agent key id or fingerprint
  chainId: ChainId
  asset: AssetSymbol
  budget: bigint // base units
  perProofAmount: bigint // base units
  maxProofs: number
  perKOLCap: number
  deadline: number // ms since epoch
  rules: CampaignRules
  status: JobStatus
  escrowRef?: string | null
  createdAt: number
  updatedAt: number
}

export type CampaignJob = JobBase & {
  type: 'campaign'
}

export type Job = CampaignJob

export type JobClaim = {
  id: string
  jobId: string
  kolHandle?: string // optional at claim time
  kolWallet: string
  kolChainId: ChainId
  status: 'claimed' | 'submitted' | 'verified' | 'paid' | 'rejected'
  createdAt: number
  updatedAt: number
}

export type Submission = {
  id: string
  claimId: string
  urls: string[]
  createdAt: number
  verifiedAt?: number
  verification?: {
    ok: boolean
    reason?: string
    details?: Record<string, unknown>
    acceptedUrls?: string[]
  }
  paidAmount?: bigint
}

export type FundingRecord = {
  id: string
  jobId: string
  rail: string
  amount: bigint
  createdAt: number
  verified: boolean
  verifyDetail?: string
}

export type ReleaseRecord = {
  id: string
  jobId: string
  claimId: string
  to: string // wallet
  amount: bigint
  createdAt: number
  rail: string
  txRef?: string
}

export type RefundRecord = {
  id: string
  jobId: string
  to: string
  amount: bigint
  createdAt: number
  rail: string
  txRef?: string
}

export function nowMs(): number {
  return Date.now()
}

export function clampBigint(n: bigint, min: bigint, max: bigint): bigint {
  if (n < min) return min
  if (n > max) return max
  return n
}

export function parseAmountToBigint(n: number | string): bigint {
  const v = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(v) || v < 0) throw new Error('Invalid amount')
  // Base units for tests: treat as 1e9 for SOL, 1e6 for USDC — leave exact unit scaling to rails.
  // Here we store canonical bigint as lamports-like test units (1e9).
  return BigInt(Math.round(v * 1e9))
}

export function formatAmountFromBigint(v: bigint, decimals = 9): number {
  // Drop precision intentionally for display in tests.
  const s = v.toString().padStart(decimals + 1, '0')
  const int = s.slice(0, -decimals)
  const frac = s.slice(-decimals).replace(/0+$/, '')
  return Number(frac ? `${int}.${frac}` : int)
}

