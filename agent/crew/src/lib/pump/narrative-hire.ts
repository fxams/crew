import { equalShares } from '../../data'
import { MAX_CREW } from '../config'
import type { CrewMember, HireRole, LaunchDraft } from '../types'
import {
  KOL_DB,
  correlationScore,
  type KolRecord,
  type NarrativeTag,
} from './kol-directory'

const TAG_KEYWORDS: Record<NarrativeTag, string[]> = {
  meme: [
    'meme',
    'funny',
    'joke',
    'lol',
    'based',
    'wagmi',
    'ngmi',
    'copium',
    'hopium',
    'shitpost',
    'viral',
    'coin',
  ],
  animal: [
    'cat',
    'dog',
    'frog',
    'pepe',
    'wojak',
    'bird',
    'ape',
    'monkey',
    'fish',
    'whale',
    'bull',
    'bear',
    'raccoon',
    'hamster',
    'duck',
    'pig',
    'goat',
    'fox',
    'wolf',
    'mouse',
  ],
  ai: [
    'ai',
    'agent',
    'gpt',
    'claude',
    'llm',
    'robot',
    'neural',
    'model',
    'mind',
    'bot',
    'autonomous',
    'machine',
  ],
  trench: [
    'trench',
    'bundler',
    'sniper',
    'cabal',
    'insider',
    'degen call',
    'caller',
    'bundle',
    'launch',
  ],
  degen: [
    'degen',
    'ape',
    'moon',
    'send',
    'pump',
    'jeet',
    'rug',
    'cto',
    'flip',
    'casino',
    'yolo',
  ],
  politics: [
    'trump',
    'biden',
    'maga',
    'election',
    'president',
    'vote',
    'politics',
    'congress',
    'senate',
  ],
  gaming: [
    'game',
    'play',
    'npc',
    'boss',
    'quest',
    'raid boss',
    'pixel',
    'rpg',
    'steam',
    'esport',
  ],
  culture: [
    'culture',
    'art',
    'music',
    'film',
    'stream',
    'ct',
    'timeline',
    'viral',
    'celebrity',
    'influencer',
  ],
  raid: ['raid', 'reply', 'spam', 'engage', 'shill', 'quote', 'spaces'],
  general: [],
}

export type NarrativeMatch = {
  tags: NarrativeTag[]
  /** Weighted tag hits — index 0 is primary. */
  weights: number[]
  /** Human-readable why we picked these tags */
  reasons: string[]
}

export type HiredKol = {
  kol: KolRecord
  score: number
  role: HireRole
  share: number
  /** 1-based seat rank after packing / manual reorder */
  hireRank: number
  reasons: string[]
}

export type NarrativeHirePlan = {
  match: NarrativeMatch
  hires: HiredKol[]
  crew: CrewMember[]
}

function tokenize(blob: string): string[] {
  return blob
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
}

function normHandle(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase()
}

/** Detect narrative tags from token name / ticker / vibe. */
export function detectNarratives(input: {
  name?: string
  ticker?: string
  vibe?: string
}): NarrativeMatch {
  const parts = [input.name, input.ticker, input.vibe].filter(Boolean).join(' ')
  const blob = parts.toLowerCase()
  const tokens = new Set(tokenize(blob))
  const reasons: string[] = []
  const hits = new Map<NarrativeTag, number>()

  for (const [tag, words] of Object.entries(TAG_KEYWORDS) as [NarrativeTag, string[]][]) {
    if (tag === 'general') continue
    let score = 0
    for (const w of words) {
      const key = w.toLowerCase()
      if (key.includes(' ')) {
        if (blob.includes(key)) {
          score += 3
          reasons.push(`${tag}: “${w}”`)
        }
        continue
      }
      if (tokens.has(key) || blob.includes(key)) {
        score += key.length >= 4 ? 2 : 1
        reasons.push(`${tag}: “${w}”`)
      }
    }
    if (score > 0) hits.set(tag, score)
  }

  const ticker = (input.ticker || '').toUpperCase()
  if (/AI|GPT|BOT|LLM|AGENT|CLAW/.test(ticker)) {
    hits.set('ai', (hits.get('ai') || 0) + 4)
    reasons.push('ai: ticker')
  }
  if (/CAT|DOG|PEPE|FROG|APE|BIRD|FISH|FOX|WOLF/.test(ticker)) {
    hits.set('animal', (hits.get('animal') || 0) + 4)
    reasons.push('animal: ticker')
  }
  if (/TRUMP|MAGA|BIDEN|VOTE/.test(ticker)) {
    hits.set('politics', (hits.get('politics') || 0) + 4)
    reasons.push('politics: ticker')
  }
  if (/RAID|SHILL/.test(ticker)) {
    hits.set('raid', (hits.get('raid') || 0) + 3)
    reasons.push('raid: ticker')
  }

  let ranked = [...hits.entries()].sort((a, b) => b[1] - a[1])
  if (!ranked.length) {
    ranked = [
      ['trench', 2],
      ['degen', 2],
      ['meme', 1],
    ]
    reasons.push('default: trench / degen / meme pack')
  }

  const tags = ranked.slice(0, 4).map(([t]) => t)
  const weights = ranked.slice(0, 4).map(([, w]) => w)
  return { tags, weights, reasons: reasons.slice(0, 10) }
}

function roleFor(kol: KolRecord, index: number, used: Set<HireRole>): HireRole {
  for (const r of kol.roles) {
    if (!used.has(r)) {
      used.add(r)
      return r
    }
  }
  const fallback: HireRole[] = ['caller', 'chart', 'kol', 'raid', 'dev']
  const pick = fallback[index % fallback.length]
  used.add(pick)
  return pick
}

/** Equal integer percents that sum to 100 (matches launch desk default). */
export function splitShares(n: number): number[] {
  if (n <= 0) return []
  return equalShares(n)
}

const JUNK_USER = /^user\d+$/i

function tagWeight(match: NarrativeMatch, tag: NarrativeTag): number {
  const idx = match.tags.indexOf(tag)
  if (idx < 0) return 0
  // Primary tag dominates fit scoring.
  const tier = idx === 0 ? 22 : idx === 1 ? 12 : idx === 2 ? 7 : 4
  const weightBoost = Math.min(6, match.weights[idx] ?? 0)
  return tier + weightBoost
}

function scoreKolForLaunch(
  kol: KolRecord,
  match: NarrativeMatch,
  inputTokens: Set<string>,
  ticker: string,
): { score: number; reasons: string[]; narrativeHits: number } {
  let score = 0
  let narrativeHits = 0
  const reasons: string[] = []

  const tagHits: { tag: NarrativeTag; weight: number }[] = []
  for (const t of kol.narratives) {
    const w = tagWeight(match, t)
    if (w > 0) {
      score += w
      narrativeHits += 1
      tagHits.push({ tag: t, weight: w })
    }
  }
  // Surface primary-tag fit first so Autohire reasons match the narrative.
  tagHits
    .sort((a, b) => b.weight - a.weight)
    .forEach((h) => reasons.push(`fits ${h.tag}`))

  const handles = [kol.pump, kol.x, ...(kol.aliases || [])]
    .filter(Boolean)
    .map((h) => normHandle(String(h)))

  for (const h of handles) {
    if (!h) continue
    if (inputTokens.has(h)) {
      score += 16
      reasons.push(`named @${h}`)
    }
    if (ticker && h.includes(ticker.toLowerCase()) && ticker.length >= 3) {
      score += 8
      reasons.push(`ticker in @${h}`)
    }
  }

  // Reach matters, but narrative fit should win.
  score += Math.log10(kol.followers + 10) * 4
  if (kol.rank <= 20) {
    score += 9
    reasons.push(`top ${kol.rank}`)
  } else if (kol.rank <= 100) {
    score += 5
    reasons.push(`top ${kol.rank}`)
  } else if (kol.rank <= 300) {
    score += 2
  }

  return { score, reasons, narrativeHits }
}

/**
 * Rank KOLs for a launch narrative — primary-tag fit first, then pack correlation,
 * role diversity, and follower reach. Returns up to `limit` hires with equal shares.
 */
export function planNarrativeHires(
  input: { name?: string; ticker?: string; vibe?: string },
  opts?: { limit?: number; minFollowers?: number },
): NarrativeHirePlan {
  const limit = Math.max(1, Math.min(MAX_CREW, opts?.limit ?? 3))
  const minFollowers = opts?.minFollowers ?? 5_000
  const match = detectNarratives(input)
  const primary = match.tags[0]
  const blob = [input.name, input.ticker, input.vibe].filter(Boolean).join(' ')
  const inputTokens = new Set(tokenize(blob))
  const ticker = (input.ticker || '').toUpperCase()

  type Scored = {
    kol: KolRecord
    score: number
    reasons: string[]
    narrativeHits: number
    primaryHit: boolean
  }

  const scored: Scored[] = KOL_DB.filter(
    (kol) =>
      kol.followers >= minFollowers &&
      !JUNK_USER.test(kol.pump) &&
      kol.wallet.length >= 32,
  )
    .map((kol) => {
      const s = scoreKolForLaunch(kol, match, inputTokens, ticker)
      return {
        kol,
        score: s.score,
        reasons: s.reasons,
        narrativeHits: s.narrativeHits,
        primaryHit: primary ? kol.narratives.includes(primary) : false,
      }
    })
    .filter((s) => s.narrativeHits > 0 || s.score >= 12)

  scored.sort(
    (a, b) =>
      Number(b.primaryHit) - Number(a.primaryHit) ||
      b.score - a.score ||
      a.kol.rank - b.kol.rank,
  )

  const picked: Scored[] = []
  const remaining = [...scored]
  const usedRoles = new Set<HireRole>()

  while (picked.length < limit && remaining.length) {
    let bestIdx = 0
    let bestScore = -Infinity
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i]!
      let score = candidate.score
      const reasons = [...candidate.reasons]

      // Early seats prefer primary-tag specialists.
      if (picked.length < Math.ceil(limit / 2) && candidate.primaryHit) {
        score += 10
      }

      for (const p of picked) {
        const c = correlationScore(p.kol.id, candidate.kol.id)
        if (c > 0) {
          score += c * 7
          reasons.push(`pack w/ @${p.kol.pump}`)
        }
      }

      // Soft role diversity — prefer unused hire roles.
      const nextRole = roleFor(candidate.kol, picked.length, new Set(usedRoles))
      if (!usedRoles.has(nextRole)) {
        score += 3
        reasons.push(`role ${nextRole}`)
      }

      if (score > bestScore) {
        bestScore = score
        bestIdx = i
        remaining[i] = { ...candidate, score, reasons }
      }
    }

    const [next] = remaining.splice(bestIdx, 1)
    if (!next) break
    if (picked.some((p) => p.kol.wallet === next.kol.wallet)) continue
    const role = roleFor(next.kol, picked.length, usedRoles)
    picked.push(next)
    void role
  }

  // Recompute final roles in seat order (usedRoles mutated above already).
  const finalRoles = new Set<HireRole>()
  const shares = splitShares(picked.length)
  const hires: HiredKol[] = picked.map((p, i) => ({
    kol: p.kol,
    score: p.score,
    role: roleFor(p.kol, i, finalRoles),
    share: shares[i] ?? 0,
    hireRank: i + 1,
    reasons: p.reasons.slice(0, 4),
  }))

  const crew: CrewMember[] = hires.map((h) => ({
    handle: `@${(h.kol.x || h.kol.pump).replace(/^@+/, '')}`,
    wallet: h.kol.wallet,
    share: h.share,
    hireRole: h.role,
  }))

  return { match, hires, crew }
}

/** Apply hire plan onto a launch draft (replaces crew). */
export function applyNarrativeHire(
  draft: LaunchDraft,
  opts?: { limit?: number },
): { draft: LaunchDraft; plan: NarrativeHirePlan } {
  const plan = planNarrativeHires(
    { name: draft.name, ticker: draft.ticker, vibe: draft.vibe },
    opts,
  )
  return {
    plan,
    draft: {
      ...draft,
      crew: plan.crew.map((m) => ({ ...m })),
    },
  }
}

/** Reorder crew (+ optional hire plan) by ±1 seat and refresh equal shares / ranks. */
export function reorderCrewSeats(
  crew: CrewMember[],
  index: number,
  delta: -1 | 1,
  hires?: HiredKol[] | null,
): { crew: CrewMember[]; hires: HiredKol[] | null } {
  const j = index + delta
  if (index < 0 || j < 0 || index >= crew.length || j >= crew.length) {
    return { crew, hires: hires ?? null }
  }
  const nextCrew = crew.map((m) => ({ ...m }))
  const tmp = nextCrew[index]!
  nextCrew[index] = nextCrew[j]!
  nextCrew[j] = tmp
  const shares = equalShares(nextCrew.length)
  for (let i = 0; i < nextCrew.length; i += 1) {
    nextCrew[i] = { ...nextCrew[i]!, share: shares[i]! }
  }

  let nextHires: HiredKol[] | null = null
  if (hires && hires.length === crew.length) {
    nextHires = hires.map((h) => ({ ...h, kol: h.kol, reasons: [...h.reasons] }))
    const ht = nextHires[index]!
    nextHires[index] = nextHires[j]!
    nextHires[j] = ht
    nextHires = nextHires.map((h, i) => ({
      ...h,
      hireRank: i + 1,
      share: shares[i]!,
    }))
  }

  return { crew: nextCrew, hires: nextHires }
}
