import { MAX_CREW } from './lib/config'
import type { CrewMember, DeskMode, LaunchDraft } from './lib/types'

export type { DeskMode, CrewMember, LaunchDraft } from './lib/types'

export const DESK_MODES: {
  id: DeskMode
  label: string
  short: string
  blurb: string
}[] = [
  {
    id: 'split',
    label: 'Fee Split',
    short: 'Split',
    blurb: '25% CREW buyback · 75% to tagged crew wallets.',
  },
  {
    id: 'buyback',
    label: 'Dip Buyback',
    short: 'Buyback',
    blurb: '25% CREW buyback · 20% desk dips · 55% to crew.',
  },
  {
    id: 'raid',
    label: 'Raid Pool',
    short: 'Raid',
    blurb: '25% CREW buyback · 25% raid pool · 50% to crew.',
  },
  {
    id: 'agent',
    label: 'Agent Hire',
    short: 'Agent',
    blurb: '25% CREW buyback · 15% agent ops · 60% hired KOLs.',
  },
]

/** Empty Pump-style form — one seat at 100% (equal split of 1). */
export const DEFAULT_DRAFT: LaunchDraft = {
  name: '',
  ticker: '',
  vibe: '',
  mode: 'split',
  crew: [{ handle: '', wallet: '', share: 100 }],
  initialBuySol: 0,
  imageFile: null,
  twitter: '',
  website: '',
  buybackRule: undefined,
  raidQuests: undefined,
  agent: undefined,
  holderKol: false,
}

export function totalShare(crew: { share: number }[]) {
  return crew.reduce((sum, member) => sum + (Number(member.share) || 0), 0)
}

/** Integer percents that always sum to 100. Remainder goes to the first seats. */
export function equalShares(count: number): number[] {
  const n = Math.min(MAX_CREW, Math.max(1, Math.floor(count)))
  const base = Math.floor(100 / n)
  const rem = 100 - base * n
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0))
}

export function withEqualShares<T extends { share: number }>(crew: T[]): T[] {
  const shares = equalShares(crew.length)
  return crew.map((member, i) => ({ ...member, share: shares[i]! }))
}

/** Grow/shrink crew rows and reset to equal % (default UX). */
export function resizeCrew(crew: CrewMember[], count: number): CrewMember[] {
  const n = Math.min(MAX_CREW, Math.max(1, Math.floor(count)))
  const next = crew.slice(0, n).map((m) => ({ ...m }))
  while (next.length < n) {
    next.push({ handle: '', wallet: '', share: 0 })
  }
  return withEqualShares(next)
}

export function normalizeTicker(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)
}
