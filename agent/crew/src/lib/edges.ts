import { PLATFORM_BUYBACK_BPS } from './config'
import type {
  BuybackRule,
  CoinRecord,
  DeskMode,
  LaunchDraft,
  RaidQuest,
  RemitRecord,
} from './types'

/** Product edges for Agents hire → Crew gets paid. */
export const CREW_EDGES = [
  {
    id: 'hybrid',
    title: 'Agents hire the launch',
    agency: 'A token alone rarely prints without distribution.',
    crew: 'Autohire KOLs from narrative, lock fee-shares, then launch.',
  },
  {
    id: 'humans',
    title: 'Crew gets paid on-chain',
    agency: 'Handshake deals and screenshots do not settle.',
    crew: 'Named wallets take a permanent creator-fee cut — remits on the tape.',
  },
  {
    id: 'control',
    title: 'Successful launch needs KOLs',
    agency: 'Mind-only launches stall when nobody moves the chart.',
    crew: 'Seats for caller / chart / KOL wallets. Atomic fee-lock before the first public block.',
  },
  {
    id: 'tape',
    title: 'Buyback + proof stay public',
    agency: 'Opaque treasuries hide whether humans were paid.',
    crew: '25% CREW fee-share locks to treasury every launch. Proof tape shows remits and buyback runs when configured.',
  },
] as const

export type LaunchTemplate = {
  id: string
  label: string
  blurb: string
  draft: Pick<
    LaunchDraft,
    | 'name'
    | 'ticker'
    | 'vibe'
    | 'mode'
    | 'crew'
    | 'initialBuySol'
    | 'agent'
    | 'twitter'
    | 'website'
  > & {
    buybackRule?: BuybackRule
    raidQuests?: RaidQuest[]
  }
}

export const DEFAULT_AGENT = {
  name: 'Desk Mind',
  objective:
    'Hire KOLs who move the chart. Pay them from creator fees. 25% CREW buyback on every launch.',
  model: 'Claude Sonnet',
}

export const DEFAULT_BUYBACK: BuybackRule = {
  dipPct: 18,
  maxSolPerFire: 0.25,
  cooldownHours: 4,
}

export const DEFAULT_RAID_QUESTS: RaidQuest[] = [
  {
    id: 'q_post',
    title: 'Post the chart + tag crew',
    bountyBps: 4000,
    proof: 'X post link',
  },
  {
    id: 'q_reply',
    title: 'Reply-raid top bear',
    bountyBps: 3500,
    proof: 'Reply screenshot',
  },
  {
    id: 'q_holder',
    title: 'Diamond 1h after raid call',
    bountyBps: 2500,
    proof: 'Wallet hold proof',
  },
]

/** Mode / crew skeletons only — name, ticker, image still required from the user. */
export const LAUNCH_TEMPLATES: LaunchTemplate[] = [
  {
    id: 'agent',
    label: 'Agent hires',
    blurb: 'AI Autohires KOLs · 25% CREW buyback.',
    draft: {
      name: '',
      ticker: '',
      vibe: '',
      mode: 'agent',
      initialBuySol: 0,
      twitter: '',
      website: '',
      agent: { name: '', objective: '', model: 'custom' },
      crew: [
        { handle: '', wallet: '', share: 45, hireRole: 'caller' },
        { handle: '', wallet: '', share: 30, hireRole: 'chart' },
        { handle: '', wallet: '', share: 25, hireRole: 'kol' },
      ],
    },
  },
  {
    id: 'kol',
    label: 'KOL pack',
    blurb: '3-way split · 25% CREW buyback.',
    draft: {
      name: '',
      ticker: '',
      vibe: '',
      mode: 'split',
      initialBuySol: 0,
      twitter: '',
      website: '',
      crew: [
        { handle: '', wallet: '', share: 50 },
        { handle: '', wallet: '', share: 30 },
        { handle: '', wallet: '', share: 20 },
      ],
    },
  },
  {
    id: 'dip',
    label: 'Dip desk',
    blurb: 'Dip buyback desk · 25% CREW buyback.',
    draft: {
      name: '',
      ticker: '',
      vibe: '',
      mode: 'buyback',
      initialBuySol: 0,
      twitter: '',
      website: '',
      crew: [
        { handle: '', wallet: '', share: 60 },
        { handle: '', wallet: '', share: 40 },
      ],
      buybackRule: { ...DEFAULT_BUYBACK },
    },
  },
]

/** Kept for existing raid coins / desk actions — not offered on new launches. */
export const RAID_LAUNCH_TEMPLATE: LaunchTemplate = {
  id: 'raid',
  label: 'Raid squad',
  blurb: 'Raid pool · 25% CREW buyback.',
  draft: {
    name: '',
    ticker: '',
    vibe: '',
    mode: 'raid',
    initialBuySol: 0,
    twitter: '',
    website: '',
    crew: [
      { handle: '', wallet: '', share: 45 },
      { handle: '', wallet: '', share: 35 },
      { handle: '', wallet: '', share: 20 },
    ],
    raidQuests: DEFAULT_RAID_QUESTS.map((q) => ({ ...q })),
  },
}

export type ScoreRow = {
  handle: string
  totalSol: number
  remits: number
  tickers: string[]
}

export function buildScoreboard(remits: RemitRecord[], limit = 8): ScoreRow[] {
  const map = new Map<string, ScoreRow>()
  for (const r of remits) {
    if (
      !r.handle ||
      r.handle === '@desk' ||
      r.handle === '@buyback' ||
      r.handle === '@raid' ||
      r.handle === '@agent'
    ) {
      continue
    }
    const key = r.handle.toLowerCase()
    const row = map.get(key) ?? {
      handle: r.handle,
      totalSol: 0,
      remits: 0,
      tickers: [],
    }
    row.totalSol += r.amountSol || 0
    row.remits += 1
    if (r.ticker && !row.tickers.includes(r.ticker)) row.tickers.push(r.ticker)
    map.set(key, row)
  }
  return [...map.values()]
    .sort((a, b) => b.totalSol - a.totalSol || b.remits - a.remits)
    .slice(0, limit)
}

function isHumanHandle(handle: string) {
  return (
    Boolean(handle) &&
    !['@desk', '@buyback', '@raid', '@agent', '@crew-buyback'].includes(handle)
  )
}

export function deskStats(coins: CoinRecord[], remits: RemitRecord[]) {
  const human = remits.filter((r) => isHumanHandle(r.handle))
  const paidSol = human.reduce((s, r) => s + (r.amountSol || 0), 0)
  return {
    coins: coins.length,
    remits: remits.length,
    humanRemits: human.length,
    paidSol,
    platformCut: PLATFORM_BUYBACK_BPS / 100,
  }
}

export function shareReceiptText(coin: CoinRecord): string {
  const split = coin.crew
    .map((m) =>
      m.hireRole ? `${m.handle} (${m.hireRole}) ${m.share}%` : `${m.handle} ${m.share}%`,
    )
    .join(' · ')
  const label = modeLabel(coin.mode)
  const agentLine =
    coin.mode === 'agent' && coin.agent
      ? `Agent ${coin.agent.name} hires · 15% ops`
      : null
  return [
    `$${coin.ticker} crew locked on CREW`,
    agentLine,
    split,
    `${label} · ${PLATFORM_BUYBACK_BPS / 100}% CREW buyback`,
    coin.pumpUrl,
    '',
    coin.mode === 'agent'
      ? 'AI hires humans — KOLs get fee-share · CREW buys itself.'
      : 'Humans get paid · 25% fees buy back CREW.',
  ]
    .filter(Boolean)
    .join('\n')
}

export type PulseItem = {
  id: string
  kind: 'remit' | 'buyback' | 'raid' | 'lock'
  time: string
  title: string
  detail: string
  amount: string
}

export function buildDeskPulse(
  coins: CoinRecord[],
  remits: RemitRecord[],
  now: number,
): PulseItem[] {
  const items: PulseItem[] = []

  for (const r of remits.slice(0, 10)) {
    items.push({
      id: `p_${r.id}`,
      kind: r.amountSol > 0 ? 'remit' : 'lock',
      time: rel(r.at, now),
      title: r.amountSol > 0 ? `${r.handle} paid` : `${r.handle} fee-locked`,
      detail: `$${r.ticker} · ${r.mode}`,
      amount: r.amountSol > 0 ? `+${r.amountSol.toFixed(4)}` : 'LOCK',
    })
  }

  for (const c of coins.filter((x) => x.mode === 'buyback').slice(0, 3)) {
    const rule = c.buybackRule ?? DEFAULT_BUYBACK
    items.push({
      id: `bb_${c.id}`,
      kind: 'buyback',
      time: rel(c.launchedAt + 90_000, now),
      title: `$${c.ticker} dip rule armed`,
      detail: `Buy ≤${rule.maxSolPerFire} SOL on −${rule.dipPct}% · ${rule.cooldownHours}h cd`,
      amount: 'RULE',
    })
  }

  for (const c of coins.filter((x) => x.mode === 'raid').slice(0, 3)) {
    const quests = c.raidQuests ?? DEFAULT_RAID_QUESTS
    const top = quests[0]
    items.push({
      id: `rq_${c.id}`,
      kind: 'raid',
      time: rel(c.launchedAt + 120_000, now),
      title: `$${c.ticker} raid open`,
      detail: top ? `${top.title} · ${(top.bountyBps / 100).toFixed(0)}% pot` : 'Quest board live',
      amount: 'RAID',
    })
  }

  for (const c of coins.filter((x) => x.mode === 'agent').slice(0, 3)) {
    const hired = c.crew
      .filter((m) => m.hireRole)
      .map((m) => m.hireRole)
      .slice(0, 3)
      .join('/')
    items.push({
      id: `ag_${c.id}`,
      kind: 'lock',
      time: rel(c.launchedAt + 60_000, now),
      title: `$${c.ticker} agent hiring`,
      detail: c.agent
        ? `${c.agent.name} · ${hired || 'crew'} · 15% ops`
        : `Agent desk · ${hired || 'crew'}`,
      amount: 'HIRE',
    })
  }

  return items
    .sort((a, b) => rankTime(a.time) - rankTime(b.time))
    .slice(0, 16)
}

function rel(at: number, now: number) {
  const mins = Math.floor(Math.max(0, now - at) / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 48) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function rankTime(t: string) {
  if (t === 'now') return 0
  if (t.endsWith('m')) return Number(t.slice(0, -1))
  if (t.endsWith('h')) return Number(t.slice(0, -1)) * 60
  if (t.endsWith('d')) return Number(t.slice(0, -1)) * 1440
  return 9999
}

export function modeLabel(mode: DeskMode) {
  if (mode === 'buyback') return 'Dip Buyback'
  if (mode === 'raid') return 'Raid Pool'
  if (mode === 'agent') return 'Agent Hire'
  return 'Fee Split'
}
