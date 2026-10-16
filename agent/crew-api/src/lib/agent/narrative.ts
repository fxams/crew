import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyTelegramReachBoost, type TelegramReachInput } from '../telegram-reach.js'
import { equalShares, MAX_CREW, type HireRole } from './constants.js'
import { assertEvmAddress, isEvmAddress } from './evm-address.js'
import { autohireOptOuts, isOptedOut } from './optout.js'

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
  /** Base / EVM payout address — required for Zora when `wallet` is a Solana key. */
  evmWallet?: string
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
  /** How seats were selected. 'registered-first' prefers kol_registrations up to limit; 'score' is the legacy single-tier scorer. */
  policy?: 'registered-first' | 'score'
}

/** Opt-in registered crew — Autohire prefers these wallets over scraped Pump ones. */
export type RegisteredHireBoost = {
  /** lowercase handle without @ */
  handle: string
  wallet: string
  /** Optional Base / EVM payout address for Zora launches. */
  evmWallet?: string
  /** Optional extra ordering signal from registration. */
  followers?: number
  /** Optional ISO timestamp from registration. */
  registeredAt?: string
  /** Optional preferred roles from registration (fallback to ['kol']). */
  roles?: HireRole[]
  /** Optional preferred narratives from registration (fallback to ['general']). */
  narratives?: NarrativeTag[]
  /** TG-only desks without X or channel verify — allowed, ranked lower. */
  tgOnlyUnverified?: boolean
  /** Verified via posted CREW-XXXX only. Unverified / stale contribute 0. */
  tgChannelVerified?: boolean
  tgReach?: number | null
  tgChannelVerifiedAt?: string | null
}

function telegramReachInput(reg?: RegisteredHireBoost | null): TelegramReachInput {
  return {
    verified: Boolean(reg?.tgChannelVerified),
    reach: reg?.tgReach,
    verifiedAt: reg?.tgChannelVerifiedAt,
  }
}

function withTelegramReach(
  score: number,
  reasons: string[],
  reg?: RegisteredHireBoost | null,
): number {
  const { score: next, boost } = applyTelegramReachBoost(score, telegramReachInput(reg))
  if (boost > 0) reasons.push(`tgReach ${Number(reg?.tgReach)}`)
  return next
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
/** Known Pump x_username values that are empty / protected / not real CT reach (CP-3). */
const BAD_X = new Set(['oxrxbt', 'oxr'].map((s) => s.toLowerCase()))

function loadKolDb(): KolRecord[] {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(process.cwd(), 'data/kol-db.json'),
    join(here, '../../../data/kol-db.json'), // src/lib/agent → data/
    join(here, '../../../../data/kol-db.json'), // dist/src/lib/agent → data/
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
  opts?: {
    limit?: number
    minFollowers?: number
    /** When present, matching handles get a large score boost and hire the registered wallet. */
    registered?: RegisteredHireBoost[]
    /** Handles never to hire (defaults to data/autohire-optout.json + AUTOHIRE_EXCLUDE_HANDLES). */
    optOut?: Set<string>
    /** If true, fill seats only from registered KOLs. Defaults to false (registered-first). */
    onlyRegistered?: boolean
    /** Zora / Clanker: only hire KOLs with a registered evm_wallet (or 0x wallet). */
    requireEvmPayout?: boolean
  },
): NarrativeHirePlan {
  const optOut = opts?.optOut ?? autohireOptOuts()
  const registeredFirst =
    Boolean(opts?.requireEvmPayout) ||
    (process.env.AUTOHIRE_REGISTERED_FIRST || 'true').toLowerCase() === 'true'
  const limit = Math.max(1, Math.min(MAX_CREW, opts?.limit ?? 5))
  const minFollowers = opts?.minFollowers ?? 5_000
  const match = detectNarratives(input)
  const primary = match.tags[0]
  const blob = [input.name, input.ticker, input.vibe].filter(Boolean).join(' ')
  const inputTokens = new Set(tokenize(blob))
  const ticker = (input.ticker || '').toUpperCase()
  const registeredByHandle = new Map(
    (opts?.registered || [])
      .filter((r) => {
        if (!r.handle || r.wallet.length < 32) return false
        if (!opts?.requireEvmPayout) return true
        return Boolean(r.evmWallet && isEvmAddress(r.evmWallet))
      })
      .map((r) => {
        const h = r.handle.replace(/^@+/, '').toLowerCase()
        const wallet =
          opts?.requireEvmPayout && r.evmWallet && isEvmAddress(r.evmWallet)
            ? assertEvmAddress(r.evmWallet)
            : r.wallet
        return [h, wallet] as const
      }),
  )
  const preferRegistered = registeredByHandle.size >= 1

  type Scored = {
    kol: KolRecord
    score: number
    reasons: string[]
    narrativeHits: number
    primaryHit: boolean
    registered: boolean
    /** Hints for registered ordering when scores tie. */
    regFollowers?: number
    regRegisteredAtMs?: number | null
  }

  const scored: Scored[] = KOL_DB.filter(
    (kol) =>
      kol.followers >= minFollowers &&
      !JUNK_USER.test(kol.pump) &&
      kol.wallet.length >= 32 &&
      !isOptedOut([kol.pump, kol.x, ...(kol.aliases || [])], optOut),
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
      // `followers` is Pump follower count — not verified X reach (CP-3).
      score += Math.log10(kol.followers + 10) * 4
      reasons.push(`pumpFollowers ${kol.followers}`)
      if (kol.rank <= 20) {
        score += 9
        reasons.push(`top ${kol.rank}`)
      } else if (kol.rank <= 100) score += 5
      else if (kol.rank <= 300) score += 2

      // Demote empty / protected / known-bad X handles (CP-3 — was missing on API path).
      const x = (kol.x || '').trim().replace(/^@+/, '').toLowerCase()
      if (!x || BAD_X.has(x) || x === (kol.pump || '').toLowerCase()) {
        score -= 48
        reasons.push(x ? `unverified/weak X @${x}` : 'no X handle')
      }

      let hireWallet = kol.wallet
      let registered = false
      let regFollowers: number | undefined
      let regRegisteredAtMs: number | null | undefined
      for (const h of handles) {
        const regWallet = registeredByHandle.get(h)
        if (regWallet) {
          registered = true
          hireWallet = regWallet
          score += preferRegistered ? 48 : 24
          reasons.unshift('registered crew')
          const regRow = (opts?.registered || []).find(
            (r) => r.handle.replace(/^@+/, '').toLowerCase() === h,
          )
          regFollowers = Number(regRow?.followers || 0)
          regRegisteredAtMs = regRow?.registeredAt ? Date.parse(regRow.registeredAt) || null : null
          if (regRow?.tgOnlyUnverified) {
            score -= 24
            reasons.push('telegram-only until verified')
          }
          score = withTelegramReach(score, reasons, regRow)
          break
        }
      }

      return {
        kol: registered && hireWallet !== kol.wallet ? { ...kol, wallet: hireWallet } : kol,
        score,
        reasons,
        narrativeHits,
        primaryHit: primary ? kol.narratives.includes(primary) : false,
        registered,
        regFollowers,
        regRegisteredAtMs,
      }
    })
    .filter((s) => s.narrativeHits > 0 || s.score >= 12 || s.registered)
    .filter((s) => !opts?.requireEvmPayout || isEvmAddress(s.kol.wallet))

  scored.sort(
    (a, b) =>
      Number(b.registered) - Number(a.registered) ||
      Number(b.primaryHit) - Number(a.primaryHit) ||
      b.score - a.score ||
      a.kol.rank - b.kol.rank,
  )

  function greedyPick(pool: Scored[], take: number, usedWallets: Set<string>): Scored[] {
    const picked: Scored[] = []
    const remaining = [...pool]
    const usedRoles = new Set<HireRole>()
    while (picked.length < take && remaining.length) {
      let bestIdx = 0
      let bestScore = -Infinity
      for (let i = 0; i < remaining.length; i += 1) {
        const candidate = remaining[i]!
        let score = candidate.score
        const reasons = [...candidate.reasons]
        if (picked.length < Math.ceil(take / 2) && candidate.primaryHit) score += 10
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
      if (usedWallets.has(next.kol.wallet) || picked.some((p) => p.kol.wallet === next.kol.wallet)) {
        continue
      }
      // Lock role assignment for diversity credit only — final role assigned later.
      void roleFor(next.kol, picked.length, usedRoles)
      picked.push(next)
      usedWallets.add(next.kol.wallet)
    }
    return picked
  }

  // Legacy single-tier when flag is off.
  if (!registeredFirst) {
    const usedWallets = new Set<string>()
    const picked = greedyPick(scored, limit, usedWallets)
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
    return { match, hires, crew, policy: 'score' }
  }

  // Registered-first policy: build a registered pool (including synthetic rows not in kol-db).
  const knownHandles = new Set(
    scored.flatMap((s) =>
      [s.kol.pump, s.kol.x, ...(s.kol.aliases || [])]
        .filter(Boolean)
        .map((h) => String(h).replace(/^@+/, '').toLowerCase()),
    ),
  )
  const registeredPool: Scored[] = []
  // Include matching kol-db rows marked as registered.
  for (const s of scored) {
    if (s.registered) registeredPool.push(s)
  }
  // Add synthetic candidates for registered handles that are not in kol-db (or were filtered out).
  for (const r of opts?.registered || []) {
    const handle = r.handle.replace(/^@+/, '').toLowerCase()
    if (!handle || knownHandles.has(handle)) continue
    if (isOptedOut([handle], optOut)) continue
    if (!r.wallet || r.wallet.length < 32) continue // Add a wallet to get hired and paid. KOLs without a wallet are skipped for crews.
    if (opts?.requireEvmPayout && (!r.evmWallet || !isEvmAddress(r.evmWallet))) continue
    const payoutWallet =
      opts?.requireEvmPayout && r.evmWallet && isEvmAddress(r.evmWallet)
        ? assertEvmAddress(r.evmWallet)
        : r.wallet
    const id = `reg:${handle}`
    const kol: KolRecord = {
      id,
      rank: 1_000_000,
      pump: handle,
      x: handle,
      followers: Math.max(0, Number(r.followers || 0)),
      wallet: payoutWallet,
      aliases: [],
      narratives: (r.narratives && r.narratives.length ? r.narratives : (['general'] as NarrativeTag[])),
      correlated: [],
      roles: (r.roles && r.roles.length ? r.roles : (['kol'] as HireRole[])),
    }
    let score = 0
    let narrativeHits = 0
    for (const t of kol.narratives) {
      const w = tagWeight(match, t)
      if (w > 0) {
        score += w
        narrativeHits += 1
      }
    }
    // Name/ticker token hits against handle
    const h = handle
    const reasons: string[] = ['registered crew']
    if (inputTokens.has(h)) {
      score += 16
      reasons.push(`named @${h}`)
    }
    if (ticker && h.includes(ticker.toLowerCase()) && ticker.length >= 3) {
      score += 8
      reasons.push(`ticker in @${h}`)
    }
    // Registration follower hint (optional)
    if (kol.followers > 0) {
      score += Math.log10(kol.followers + 10) * 2 // softer than Pump follower weight
      reasons.push(`xFollowers ${kol.followers}`)
    }
    // Ensure a base boost so pure 'general' still competes within the registered tier.
    score += preferRegistered ? 32 : 16
    if (r.tgOnlyUnverified) {
      score -= 24
      reasons.push('telegram-only until verified')
    }
    score = withTelegramReach(score, reasons, r)
    const regRegisteredAtMs = r.registeredAt ? Date.parse(r.registeredAt) || null : null
    registeredPool.push({
      kol,
      score,
      reasons,
      narrativeHits,
      primaryHit: primary ? kol.narratives.includes(primary) : false,
      registered: true,
      regFollowers: kol.followers,
      regRegisteredAtMs,
    })
  }
  // Order registered tier by fit score, then registration recency (newer first), then followers.
  registeredPool.sort((a, b) => {
    const byScore = b.score - a.score
    if (byScore !== 0) return byScore
    const aMs = a.regRegisteredAtMs ?? -Infinity
    const bMs = b.regRegisteredAtMs ?? -Infinity
    if (aMs !== bMs) return bMs - aMs
    return (b.regFollowers || 0) - (a.regFollowers || 0)
  })
  const usedWallets = new Set<string>()
  const takeRegistered = Math.min(limit, registeredPool.length)
  const pickedReg = greedyPick(registeredPool, takeRegistered, usedWallets)
  // Remaining seats: normal non-registered pool (exclude any wallets already picked).
  const nonRegisteredPool = scored.filter((s) => !s.registered && !usedWallets.has(s.kol.wallet))
  let picked: Scored[]
  if (opts?.onlyRegistered) {
    // Strict consent: only use registered KOLs. If not enough registered seats, return fewer.
    picked = pickedReg
  } else {
    const takeNormal = Math.max(0, limit - pickedReg.length)
    const pickedNorm = takeNormal > 0 ? greedyPick(nonRegisteredPool, takeNormal, usedWallets) : []
    picked = [...pickedReg, ...pickedNorm]
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

  return { match, hires, crew, policy: 'registered-first' }
}
