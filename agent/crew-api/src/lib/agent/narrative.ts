import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { equalShares, MAX_CREW, type HireRole } from './constants.js'

export type NarrativeTag =
  | 'meme'
  | 'animal'
  | 'ai'
  | 'trench'
  | 'degen'
  | 'politics'
  | 'gaming'
  | 'culture'
  | 'raid'
  | 'general'

export type KolRecord = {
  id: string
  rank: number
  pump: string
  x: string | null
  followers: number
  wallet: string
  aliases?: string[]
  narratives: NarrativeTag[]
  correlated: string[]
  roles: HireRole[]
}

export type CrewMember = {
  handle: string
  wallet: string
  share: number
  hireRole?: HireRole
}

export type HiredKol = {
  kol: KolRecord
  score: number
  role: HireRole
  share: number
  hireRank: number
  reasons: string[]
}

export type NarrativeHirePlan = {
  match: { tags: NarrativeTag[]; weights: number[]; reasons: string[] }
  hires: HiredKol[]
  crew: CrewMember[]
}

const TAG_KEYWORDS: Record<NarrativeTag, string[]> = {
  meme: ['meme', 'funny', 'joke', 'lol', 'based', 'wagmi', 'ngmi', 'copium', 'hopium', 'shitpost', 'viral', 'coin'],
  animal: ['cat', 'dog', 'frog', 'pepe', 'wojak', 'bird', 'ape', 'monkey', 'fish', 'whale', 'bull', 'bear', 'raccoon', 'hamster', 'duck', 'pig', 'goat', 'fox', 'wolf', 'mouse'],
  ai: ['ai', 'agent', 'gpt', 'claude', 'llm', 'robot', 'neural', 'model', 'mind', 'bot', 'autonomous', 'machine'],
  trench: ['trench', 'bundler', 'sniper', 'cabal', 'insider', 'degen call', 'caller', 'bundle', 'launch'],
  degen: ['degen', 'ape', 'moon', 'send', 'pump', 'jeet', 'rug', 'cto', 'flip', 'casino', 'yolo'],
  politics: ['trump', 'biden', 'maga', 'election', 'president', 'vote', 'politics', 'congress', 'senate'],
  gaming: ['game', 'play', 'npc', 'boss', 'quest', 'raid boss', 'pixel', 'rpg', 'steam', 'esport'],
  culture: ['culture', 'art', 'music', 'film', 'stream', 'ct', 'timeline', 'viral', 'celebrity', 'influencer'],
  raid: ['raid', 'reply', 'spam', 'engage', 'shill', 'quote', 'spaces'],
  general: [],
}

const JUNK_USER = /^user\d+$/i

function loadKolDb(): KolRecord[] {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '../../../data/kol-db.json'), // src/lib/agent or dist/lib/agent → repo data/
    join(process.cwd(), 'data/kol-db.json'),
  ]
  for (const path of candidates) {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as KolRecord[]
    } catch {
      /* try next */
    }
  }
  throw new Error('kol-db.json not found — run from crew-api with data/kol-db.json present')
}

export const KOL_DB: KolRecord[] = loadKolDb()

const BY_ID = new Map(KOL_DB.map((k) => [k.id, k]))

function tokenize(blob: string): string[] {
  return blob
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
}

function correlationScore(a: string, b: string): number {
  if (a === b) return 0
  const left = BY_ID.get(a)
  const right = BY_ID.get(b)
  if (!left || !right) return 0
  const ab = left.correlated.includes(b) ? 1 : 0
  const ba = right.correlated.includes(a) ? 1 : 0
  return (ab + ba) / 2
}

export function detectNarratives(input: {
  name?: string
  ticker?: string
  vibe?: string
}): NarrativeHirePlan['match'] {
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

  let ranked = [...hits.entries()].sort((a, b) => b[1] - a[1])
  if (!ranked.length) {
    ranked = [
      ['trench', 2],
      ['degen', 2],
      ['meme', 1],
    ]
    reasons.push('default: trench / degen / meme pack')
  }

  return {
    tags: ranked.slice(0, 4).map(([t]) => t),
    weights: ranked.slice(0, 4).map(([, w]) => w),
    reasons: reasons.slice(0, 10),
  }
}

function roleFor(kol: KolRecord, index: number, used: Set<HireRole>): HireRole {
  for (const r of kol.roles) {
    if (!used.has(r)) {
      used.add(r)
      return r
    }
  }
  const fallback: HireRole[] = ['caller', 'chart', 'kol', 'raid', 'dev']
  const pick = fallback[index % fallback.length]!
  used.add(pick)
  return pick
}

function tagWeight(match: NarrativeHirePlan['match'], tag: NarrativeTag): number {
  const idx = match.tags.indexOf(tag)
  if (idx < 0) return 0
  const tier = idx === 0 ? 22 : idx === 1 ? 12 : idx === 2 ? 7 : 4
  const weightBoost = Math.min(6, match.weights[idx] ?? 0)
  return tier + weightBoost
}

export function planNarrativeHires(
  input: { name?: string; ticker?: string; vibe?: string },
  opts?: { limit?: number; minFollowers?: number },
): NarrativeHirePlan {
  const limit = Math.max(1, Math.min(MAX_CREW, opts?.limit ?? 5))
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
      let score = 0
      let narrativeHits = 0
      const tagHits: { tag: NarrativeTag; weight: number }[] = []
      for (const t of kol.narratives) {
        const w = tagWeight(match, t)
        if (w > 0) {
          score += w
          narrativeHits += 1
          tagHits.push({ tag: t, weight: w })
        }
      }
      const reasons = tagHits
        .sort((a, b) => b.weight - a.weight)
        .map((h) => `fits ${h.tag}`)

      const handles = [kol.pump, kol.x, ...(kol.aliases || [])]
        .filter(Boolean)
        .map((h) => String(h).replace(/^@+/, '').toLowerCase())
      for (const h of handles) {
        if (inputTokens.has(h)) {
          score += 16
          reasons.push(`named @${h}`)
        }
        if (ticker && h.includes(ticker.toLowerCase()) && ticker.length >= 3) {
          score += 8
          reasons.push(`ticker in @${h}`)
        }
      }
      score += Math.log10(kol.followers + 10) * 4
      if (kol.rank <= 20) score += 9
      else if (kol.rank <= 100) score += 5
      else if (kol.rank <= 300) score += 2

      return {
        kol,
        score,
        reasons,
        narrativeHits,
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
      if (picked.length < Math.ceil(limit / 2) && candidate.primaryHit) score += 10
      for (const p of picked) {
        const c = correlationScore(p.kol.id, candidate.kol.id)
        if (c > 0) {
          score += c * 7
          reasons.push(`pack w/ @${p.kol.pump}`)
        }
      }
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

  const finalRoles = new Set<HireRole>()
  const shares = equalShares(picked.length)
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
