export type CrewMode = 'fee-split' | 'dip-buyback' | 'raid-pool'

export type CrewMember = {
  handle: string
  bps: number
}

export type LaunchInput = {
  name: string
  ticker: string
  description: string
  mode: CrewMode
  crew: CrewMember[]
  imageDataUrl?: string
}

export type Coin = {
  id: string
  ca: string
  name: string
  ticker: string
  description: string
  mode: CrewMode
  crew: CrewMember[]
  launchedAt: number
  demo: boolean
}

export type Remit = {
  id: string
  coinId: string
  ticker: string
  handle: string
  amountSol: number
  amountUsd: number
  mode: CrewMode
  at: number
}

export const MODE_LABEL: Record<CrewMode, string> = {
  'fee-split': 'Fee Split',
  'dip-buyback': 'Dip Buyback',
  'raid-pool': 'Raid Pool',
}

export const MODE_BLURB: Record<CrewMode, string> = {
  'fee-split': 'Permanent cut to each tagged handle. Screenshot the split.',
  'dip-buyback': 'Crew share buys the dip. Tape prints every fill.',
  'raid-pool': 'Crew share fills a raid pool. CT moves together.',
}
