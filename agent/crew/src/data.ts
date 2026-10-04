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
    blurb: '100% of creator fees to tagged crew wallets.',
  },
  {
    id: 'buyback',
    label: 'Dip Buyback',
    short: 'Buyback',
    blurb: '20% desk reserve for dips · 80% to crew.',
  },
  {
    id: 'raid',
    label: 'Raid Pool',
    short: 'Raid',
    blurb: '25% raid pool · 75% to crew wallets.',
  },
  {
    id: 'agent',
    label: 'Agent Hire',
    short: 'Agent',
    blurb: 'AI agent keeps 15% ops · hires KOLs/X for 85%.',
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
}

export function totalShare(crew: { share: number }[]) {
  return crew.reduce((sum, member) => sum + (Number(member.share) || 0), 0)
}

export function normalizeTicker(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)
}
