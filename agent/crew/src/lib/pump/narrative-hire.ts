import type { CrewMember, HireRole, LaunchDraft } from '../types'
import {
  KOL_DB,
  correlationScore,
  type KolRecord,
  type NarrativeTag,
} from './kol-directory'

const TAG_KEYWORDS: Record<NarrativeTag, string[]> = {
  meme: ['meme', 'funny', 'joke', 'lol', 'based', 'wagmi', 'ngmi', 'copium', 'hopium'],
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
  ],
  ai: ['ai', 'agent', 'gpt', 'claude', 'llm', 'robot', 'neural', 'model', 'mind', 'bot'],
  trench: ['trench', 'bundler', 'sniper', 'cabal', 'insider', 'degen call', 'caller'],
  degen: ['degen', 'ape', 'moon', 'send', 'pump', 'jeet', 'rug', 'cto', 'flip'],
  politics: ['trump', 'biden', 'maga', 'election', 'president', 'vote', 'politics'],
  gaming: ['game', 'play', 'npc', 'boss', 'quest', 'raid boss', 'pixel', 'rpg'],
  culture: ['culture', 'art', 'music', 'film', 'stream', 'ct', 'timeline', 'viral'],
  raid: ['raid', 'reply', 'spam', 'engage', 'shill', 'quote'],
  general: [],
}

export type NarrativeMatch = {
  tags: NarrativeTag[]
  /** Human-readable why we picked these tags */
  reasons: string[]
}

export type HiredKol = {
  kol: KolRecord
  score: number
  role: HireRole
  share: number
  reasons: string[]
}

export type NarrativeHirePlan = {
  match: NarrativeMatch
  hires: HiredKol[]
  crew: CrewMember[]
}

/** Detect narrative tags from token name / ticker / vibe. */
export function detectNarratives(input: {
  name?: string
  ticker?: string
  vibe?: string
}): NarrativeMatch {
  const blob = [input.name, input.ticker, input.vibe]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const reasons: string[] = []
  const hits = new Map<NarrativeTag, number>()

  for (const [tag, words] of Object.entries(TAG_KEYWORDS) as [NarrativeTag, string[]][]) {
    if (tag === 'general') continue
    let score = 0
    for (const w of words) {
      if (blob.includes(w)) {
        score += w.length >= 4 ? 2 : 1
        reasons.push(`${tag}: “${w}”`)
      }
    }
    if (score > 0) hits.set(tag, score)
  }

  // Ticker heuristics
  const ticker = (input.ticker || '').toUpperCase()
  if (/AI|GPT|BOT|LLM/.test(ticker)) {
    hits.set('ai', (hits.get('ai') || 0) + 3)
    reasons.push('ai: ticker')
  }
  if (/CAT|DOG|PEPE|FROG|APE/.test(ticker)) {
    hits.set('animal', (hits.get('animal') || 0) + 3)
    reasons.push('animal: ticker')
  }

  let tags = [...hits.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)

  if (!tags.length) {
    tags = ['trench', 'degen', 'meme']
    reasons.push('default: trench / degen / meme pack')
  }

  return { tags: tags.slice(0, 4), reasons: reasons.slice(0, 8) }
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

/** Split 100% across n hires — largest share first. */
export function splitShares(n: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [100]
  if (n === 2) return [60, 40]
  if (n === 3) return [45, 30, 25]
  if (n === 4) return [40, 25, 20, 15]
  return [35, 25, 20, 12, 8]
}

/**
 * Rank KOLs for a narrative, boosting correlated packs.
 * Returns up to `limit` hires with wallets + shares.
 */
export function planNarrativeHires(
  input: { name?: string; ticker?: string; vibe?: string },
  opts?: { limit?: number },
): NarrativeHirePlan {
  const limit = Math.max(1, Math.min(5, opts?.limit ?? 3))
  const match = detectNarratives(input)
  const tagSet = new Set(match.tags)

  type Scored = { kol: KolRecord; score: number; reasons: string[] }
  const scored: Scored[] = KOL_DB.map((kol) => {
    let score = 0
    const reasons: string[] = []
    for (const t of kol.narratives) {
      if (tagSet.has(t)) {
        score += 10
        reasons.push(`fits ${t}`)
      }
    }
    // Rank bias — still prefer bigger accounts, lightly
    score += Math.max(0, 11 - kol.rank)
    return { kol, score, reasons }
  }).filter((s) => s.score > 0)

  scored.sort((a, b) => b.score - a.score || a.kol.rank - b.kol.rank)

  const picked: Scored[] = []
  const remaining = [...scored]
  while (picked.length < limit && remaining.length) {
    // Re-score against already-picked pack (correlation boost)
    let bestIdx = 0
    let bestScore = -Infinity
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i]
      let score = candidate.score
      const reasons = [...candidate.reasons]
      for (const p of picked) {
        const c = correlationScore(p.kol.id, candidate.kol.id)
        if (c > 0) {
          score += c * 8
          reasons.push(`correlates with @${p.kol.pump}`)
        }
      }
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
        remaining[i] = { ...candidate, score, reasons }
      }
    }
    const [next] = remaining.splice(bestIdx, 1)
    if (picked.some((p) => p.kol.wallet === next.kol.wallet)) continue
    picked.push(next)
  }
  const shares = splitShares(picked.length)
  const usedRoles = new Set<HireRole>()

  const hires: HiredKol[] = picked.map((p, i) => ({
    kol: p.kol,
    score: p.score,
    role: roleFor(p.kol, i, usedRoles),
    share: shares[i] ?? 0,
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
