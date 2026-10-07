import type { DeskMode, LaunchDraft } from './lib/types'

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

/** Empty Pump-style form — no prefilled name/ticker/image/handles. */
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

export function normalizeTicker(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)
}
