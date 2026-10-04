import type { DeskMode, LaunchDraft } from './lib/types'
import { DEFAULT_AGENT } from './lib/edges'

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

export const DEFAULT_DRAFT: LaunchDraft = {
  name: 'Desk Cat',
  ticker: 'DCAT',
  vibe: 'A trading-floor cat that tips the people who make the chart move.',
  mode: 'split',
  crew: [
    { handle: '@yourhandle', wallet: '', share: 70 },
    { handle: '@kolfriend', wallet: '', share: 30 },
  ],
  initialBuySol: 0.1,
  imageFile: null,
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

export { DEFAULT_AGENT }
