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
  vibe: string
  mode: DeskMode
  crew: CrewMember[]
  initialBuySol: number
  imageFile?: File | null
  buybackRule?: BuybackRule
  raidQuests?: RaidQuest[]
  agent?: AgentBrief
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
}

export type LaunchOk = {
  ok: true
  coin: CoinRecord
  remits: RemitRecord[]
}

export type LaunchErr = {
  ok: false
  error: string
}

export type LaunchResult = LaunchOk | LaunchErr
