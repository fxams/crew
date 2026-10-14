export type ChainId =
  | 'solana-devnet'
  | 'solana'
  | 'evm:base-sepolia'
  | 'evm:base'
  | 'evm:ethereum'
  /** Logical id until the public FLOP testnet chain id is published (override with FLOP_CHAIN_ID). */
  | 'flop-testnet'

export type AssetSymbol = 'SOL' | 'USDC' | 'ETH' | 'USDT'

export type JobType =
  | 'campaign'
  | 'task'
  | 'content'
  | 'design'
  | 'research'
  | 'community'
  | 'feedback'

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
  | 'disputed'
  | 'frozen'

export type CoinJobDeliverable =
  | 'meme-pack'
  | 'banner-logo'
  | 'x-upkeep'
  | 'website-polish'
  | 'x-post'

/** Configurable auto-checks for generic tasks (test-friendly; no live X API required). */
export type TaskAutoChecks = {
  /** Require at least one https URL in proof. */
  requireHttpsUrls?: boolean
  /** HEAD/GET the URL (mockable in tests). */
  urlReachable?: boolean
  /** Require an x.com / twitter.com URL and optional ticker/link substring checks. */
  xPost?: boolean
  requiredTicker?: string
  requiredLink?: string
  minUrls?: number
  /** Minimum proof text length when text is provided. */
  minTextLength?: number
  /** Case-insensitive keyword that must appear in text or URLs. */
  keyword?: string
  /** Regex applied to combined proof text + URLs (invalid regex ignored). */
  regex?: string
  /** Allowed file extensions in proof.files[].name (e.g. png, jpg). */
  fileExtensions?: string[]
  minFiles?: number
  maxFiles?: number
  /** Promo delivery: post must be submitted within N hours of launchAtMs. */
  postedWithinHours?: number
  /** Promo delivery: re-check URL reachability after N hours (mock-friendly). */
  stillLiveAfterHours?: number
  /** Minimum engagement score (likes+replies+retweets) when provided in proof text. */
  minEngagement?: number
  /** Launch timestamp (ms) for postedWithinHours window. */
  launchAtMs?: number
}

export type CampaignRules = {
  requiredTicker?: string
  requiredLink?: string
  minPostAgeHours?: number
  platform?: 'x' | 'any'
  /** Hours after auto-check pass before payout if agent does not object. */
  objectionWindowHours?: number
  /** Creative / post-launch kit deliverable (jobs + escrow). */
  deliverableKind?: CoinJobDeliverable
  minUrls?: number
  postsPerWeek?: number
  /** Generic task auto-checks (when job.mode === task). */
  autoChecks?: TaskAutoChecks
}

export type JobMode = 'campaign' | 'task'

export type JobBase = {
  id: string
  type: JobType
  /** campaign = per-proof KOL campaigns; task = open generic work with title/spec. */
  mode: JobMode
  title?: string
  spec?: string
  /** Free-form category label (e.g. labeling, qa, research). */
  taskCategory?: string
  createdBy: string // agent key id or fingerprint
  chainId: ChainId
  asset: AssetSymbol
  budget: bigint // base units
  perProofAmount: bigint // base units (reward per slot / per proof)
  maxProofs: number
  perKOLCap: number
  deadline: number // ms since epoch
  rules: CampaignRules
  status: JobStatus
  escrowRef?: string | null
  /** Funding wallet for non-custodial rails (unsigned release/refund). */
  escrowFrom?: string | null
  createdAt: number
  updatedAt: number
  /** CrewPay-launched mint this job is for (post-launch kit). */
  mint?: string
  templateId?: string
}

export type CampaignJob = JobBase & {
  type: JobType
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

export type SubmissionProofFile = {
  name: string
  url?: string
  mime?: string
  size?: number
}

export type Submission = {
  id: string
  claimId: string
  urls: string[]
  text?: string
  files?: SubmissionProofFile[]
  createdAt: number
  verifiedAt?: number
  verification?: {
    ok: boolean
    reason?: string
    details?: Record<string, unknown>
    acceptedUrls?: string[]
  }
  /** Agent explicitly blocked auto-release before the objection window elapsed. */
  agentObjected?: boolean
  /** When auto-release becomes eligible (ms epoch) after checks pass. */
  autoReleaseEligibleAt?: number
  paidAmount?: bigint
}

export type JobDispute = {
  id: string
  jobId: string
  claimId?: string
  openedBy: 'agent' | 'worker'
  reason: string
  status: 'open' | 'resolved'
  resolution?: 'release' | 'refund'
  resolvedAt?: number
  resolvedByWallet?: string
  createdAt: number
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

