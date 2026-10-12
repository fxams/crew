export type DeskMode = 'split' | 'buyback' | 'raid' | 'agent'

export type HireRole = 'caller' | 'chart' | 'raid' | 'kol' | 'dev' | 'agent'

export type CrewMember = {
  handle: string
  /** On-chain fee recipient. Required for launches. */
  wallet: string
  share: number
  /** Role when hired by an AI agent desk. */
  hireRole?: HireRole
}

export type AgentBrief = {
  /** Public agent / mind name. */
  name: string
  /** Standing objective the agent hires crew to pursue. */
  objective: string
  /** Display label for the brain (not an API key). */
  model: string
}

export type BuybackRule = {
  /** Fire when price is this % below local high. */
  dipPct: number
  /** Max SOL from desk reserve per fire. */
  maxSolPerFire: number
  /** Cooldown hours between fires. */
  cooldownHours: number
}

export type RaidQuest = {
  id: string
  title: string
  /** Share of raid pool in bps. */
  bountyBps: number
  proof: string
}

export type LaunchDraft = {
  name: string
  ticker: string
  /** Coin description — optional, same as Pump.fun. */
  vibe: string
  mode: DeskMode
  crew: CrewMember[]
  initialBuySol: number
  /** Required for launch (Pump.fun requires an image). Not persisted. */
  imageFile?: File | null
  /** Optional coin X / Twitter link or @handle. */
  twitter?: string
  /** Optional project website. */
  website?: string
  buybackRule?: BuybackRule
  raidQuests?: RaidQuest[]
  agent?: AgentBrief
  /**
   * When true, launch creates fee-sharing config but does NOT finalize shares —
   * desk Holder KOL lock sets the one-shot shareholder list from top holders.
   */
  holderKol?: boolean
  /** Launch venue. Default pumpfun. bags = Bags.fm; zora = Zora coins (Base). */
  platform?: import('./platforms').LaunchPlatform
}

export type CoinRecord = {
  id: string
  mint: string
  name: string
  ticker: string
  vibe: string
  mode: DeskMode
  crew: CrewMember[]
  signature: string
  feeShareSignature?: string
  launchedAt: number
  launcher: string
  pumpUrl: string
  buybackRule?: BuybackRule
  raidQuests?: RaidQuest[]
  agent?: AgentBrief
  /** Fee-share locked from top-holder ∩ KOL directory (one-shot). */
  holderKol?: boolean
  /** Launch venue (pumpfun / bags / zora). Inferred from pumpUrl when omitted. */
  platform?: import('./platforms').LaunchPlatform
}

export type RemitRecord = {
  id: string
  mint: string
  ticker: string
  handle: string
  wallet: string
  amountSol: number
  mode: DeskMode
  at: number
  signature?: string
  /** chain = distributeCreatorFees; dip_fire / raid_claim = mode desk executions. */
  source?: 'chain' | 'dip_fire' | 'raid_claim'
  /** Canonical shareholder role when attributed by the server (crew/desk/platform/agent-referral). */
  role?: string | null
}

export type LaunchOk = {
  ok: true
  coin: CoinRecord
  remits: RemitRecord[]
  /** Create landed but fee-share did not — wire fees from the desk. */
  warning?: string
}

export type LaunchErr = {
  ok: false
  error: string
}

export type LaunchResult = LaunchOk | LaunchErr
