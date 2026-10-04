import type {
  BuybackRule,
  CoinRecord,
  DeskMode,
  LaunchDraft,
  RaidQuest,
  RemitRecord,
} from './types'

/** Why CREW beats Agency for CT / KOL desks — not an AI mind clone. */
export const CREW_EDGES = [
  {
    id: 'humans',
    title: 'Humans get the fees',
    agency: 'Agency takes 100% of creator fees for AI credits + treasury.',
    crew: '0% platform cut. Named wallets lock a permanent on-chain split.',
  },
  {
    id: 'control',
    title: 'You own the desk',
    agency: 'Launcher cannot control the mind after launch.',
    crew: 'Fee map is yours — crew, buyback reserve, or raid pool you configure.',
  },
  {
    id: 'dayone',
    title: 'Paid from crank one',
    agency: 'Mind sleeps until ~$20 in fees; then 15% still burns $AGENCY.',
    crew: 'Crank remits anytime. No wake-up tax. No token burn skim.',
  },
  {
    id: 'tape',
    title: 'Screenshotable receipts',
    agency: 'Thought logs are cool — hard to tip a KOL with them.',
    crew: 'Every remit hits the public tape with handle + SOL. CT-ready.',
  },
] as const

export type LaunchTemplate = {
  id: string
  label: string
  blurb: string
  draft: Pick<LaunchDraft, 'name' | 'ticker' | 'vibe' | 'mode' | 'crew' | 'initialBuySol'> & {
    buybackRule?: BuybackRule
    raidQuests?: RaidQuest[]
  }
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

export const LAUNCH_TEMPLATES: LaunchTemplate[] = [
  {
    id: 'kol',
    label: 'KOL pack',
    blurb: 'Caller + chart witch + reply guy.',
    draft: {
      name: 'Crew Signal',
      ticker: 'SIG',
      vibe: 'Fees tip the people who actually move the timeline.',
      mode: 'split',
      initialBuySol: 0.15,
      crew: [
        { handle: '@caller', wallet: '', share: 50 },
        { handle: '@chartwitch', wallet: '', share: 30 },
        { handle: '@replyguy', wallet: '', share: 20 },
      ],
    },
  },
  {
    id: 'dip',
    label: 'Dip desk',
    blurb: 'Crew + buyback reserve with dip rules.',
    draft: {
      name: 'Floor Guard',
      ticker: 'FLOOR',
      vibe: 'Crew gets paid. Desk buys verified dips.',
      mode: 'buyback',
      initialBuySol: 0.2,
      crew: [
        { handle: '@caller', wallet: '', share: 60 },
        { handle: '@analyst', wallet: '', share: 40 },
      ],
      buybackRule: { ...DEFAULT_BUYBACK },
    },
  },
  {
    id: 'raid',
    label: 'Raid squad',
    blurb: 'Raid pool + 3 quests for posters.',
    draft: {
      name: 'Raid Frog',
      ticker: 'FROG',
      vibe: 'Post, raid, get paid from the pot.',
      mode: 'raid',
      initialBuySol: 0.1,
      crew: [
        { handle: '@frogcaller', wallet: '', share: 45 },
        { handle: '@chartwitch', wallet: '', share: 35 },
        { handle: '@raidcap', wallet: '', share: 20 },
      ],
      raidQuests: DEFAULT_RAID_QUESTS.map((q) => ({ ...q })),
    },
  },
]

export type ScoreRow = {
  handle: string
  totalSol: number
  remits: number
  tickers: string[]
}

export function buildScoreboard(remits: RemitRecord[], limit = 8): ScoreRow[] {
  const map = new Map<string, ScoreRow>()
  for (const r of remits) {
    if (!r.handle || r.handle === '@desk') continue
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

export function deskStats(coins: CoinRecord[], remits: RemitRecord[]) {
  const paidSol = remits.reduce((s, r) => s + (r.amountSol || 0), 0)
  const humanRemits = remits.filter((r) => r.handle && r.handle !== '@desk').length
  const mainnetCoins = coins.filter((c) => c.network === 'mainnet').length
  return {
    coins: coins.length,
    mainnetCoins,
    remits: remits.length,
    humanRemits,
    paidSol,
    platformCut: 0,
  }
}

export function shareReceiptText(coin: CoinRecord): string {
  const split = coin.crew.map((m) => `${m.handle} ${m.share}%`).join(' · ')
  const label = modeLabel(coin.mode)
  return [
    `$${coin.ticker} crew locked on CREW`,
    split,
    `${label} · 0% platform cut`,
    coin.pumpUrl,
    '',
    'Humans get paid — not an AI treasury.',
  ].join('\n')
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
  return 'Fee Split'
}
