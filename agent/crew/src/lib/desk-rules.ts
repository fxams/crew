/**
 * Enforce Dip Buyback + Raid Pool desk rules before on-chain execute.
 * Price via Jupiter (public); cooldowns + local high in localStorage.
 */

import { DEFAULT_BUYBACK, DEFAULT_RAID_QUESTS } from './edges'
import type { BuybackRule, CoinRecord, RaidQuest, RemitRecord } from './types'

const DESK_STATE_KEY = 'crew.desk.v1'

export type MintDeskState = {
  /** Highest USD price observed for dip math. */
  localHighUsd?: number
  lastPriceUsd?: number
  lastDipFireAt?: number
  /** questId → last claim timestamp */
  lastRaidClaimAt?: Record<string, number>
}

export type DeskState = Record<string, MintDeskState>

/** In-memory primary store (SSR / tests / private mode); mirrored to localStorage when available. */
let memoryState: DeskState = {}

function readDeskState(): DeskState {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(DESK_STATE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          memoryState = parsed as DeskState
        }
      }
    }
  } catch {
    /* keep memory */
  }
  return memoryState
}

function writeDeskState(state: DeskState) {
  memoryState = state
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DESK_STATE_KEY, JSON.stringify(state))
    }
  } catch {
    /* private mode / quota */
  }
}

export function getMintDeskState(mint: string): MintDeskState {
  return readDeskState()[mint] || {}
}

export function patchMintDeskState(mint: string, patch: Partial<MintDeskState>) {
  const all = readDeskState()
  const prev = all[mint] || {}
  all[mint] = {
    ...prev,
    ...patch,
    lastRaidClaimAt: {
      ...(prev.lastRaidClaimAt || {}),
      ...(patch.lastRaidClaimAt || {}),
    },
  }
  writeDeskState(all)
  return all[mint]!
}

/** Public Jupiter price (USD) for a mint — null if unavailable. */
export async function fetchTokenUsdPrice(mint: string): Promise<number | null> {
  const urls = [
    `https://lite-api.jup.ag/price/v2?ids=${encodeURIComponent(mint)}`,
    `https://api.jup.ag/price/v2?ids=${encodeURIComponent(mint)}`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const json = (await res.json()) as {
        data?: Record<string, { price?: string | number } | null>
      }
      const raw = json.data?.[mint]?.price
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (Number.isFinite(n) && n > 0) return n
    } catch {
      /* try next */
    }
  }
  return null
}

export type DipGateOk = {
  ok: true
  priceUsd: number
  localHighUsd: number
  dropPct: number
  rule: BuybackRule
  hoursSinceLastFire: number | null
}

export type DipGateErr = {
  ok: false
  error: string
  code: 'cooldown' | 'no_dip' | 'no_price' | 'mode'
  priceUsd?: number
  localHighUsd?: number
  dropPct?: number
  retryAt?: number
}

export type DipGate = DipGateOk | DipGateErr

/**
 * Evaluate whether a dip fire is allowed.
 * Updates local high when price is available (even if gate fails on cooldown/dip).
 */
export async function evaluateDipGate(
  coin: CoinRecord,
  opts?: { force?: boolean; remits?: RemitRecord[] },
): Promise<DipGate> {
  if (coin.mode !== 'buyback') {
    return { ok: false, error: 'Dip fire only works on Dip Buyback coins.', code: 'mode' }
  }
  const rule = coin.buybackRule ?? DEFAULT_BUYBACK
  const state = getMintDeskState(coin.mint)

  const lastFromRemits = (opts?.remits || [])
    .filter((r) => r.mint === coin.mint && r.source === 'dip_fire')
    .reduce((max, r) => Math.max(max, r.at || 0), 0)
  const lastFireAt = Math.max(state.lastDipFireAt || 0, lastFromRemits)

  if (!opts?.force && lastFireAt > 0) {
    const elapsedMs = Date.now() - lastFireAt
    const needMs = rule.cooldownHours * 3600_000
    if (elapsedMs < needMs) {
      const retryAt = lastFireAt + needMs
      const hoursLeft = ((needMs - elapsedMs) / 3600_000).toFixed(1)
      return {
        ok: false,
        code: 'cooldown',
        error: `Dip cooldown · ${hoursLeft}h left (rule ${rule.cooldownHours}h).`,
        retryAt,
      }
    }
  }

  const priceUsd = await fetchTokenUsdPrice(coin.mint)
  if (priceUsd == null) {
    if (opts?.force) {
      return {
        ok: true,
        priceUsd: 0,
        localHighUsd: state.localHighUsd || 0,
        dropPct: 0,
        rule,
        hoursSinceLastFire: lastFireAt ? (Date.now() - lastFireAt) / 3600_000 : null,
      }
    }
    return {
      ok: false,
      code: 'no_price',
      error:
        'Could not read live price for dip check. Retry later, or use Force execute if you accept the risk.',
    }
  }

  const localHighUsd = Math.max(state.localHighUsd || 0, priceUsd)
  patchMintDeskState(coin.mint, { localHighUsd, lastPriceUsd: priceUsd })

  const dropPct =
    localHighUsd > 0 ? Number((((localHighUsd - priceUsd) / localHighUsd) * 100).toFixed(2)) : 0

  if (!opts?.force && dropPct + 1e-9 < rule.dipPct) {
    return {
      ok: false,
      code: 'no_dip',
      error: `No dip yet · −${dropPct}% vs local high (need −${rule.dipPct}%).`,
      priceUsd,
      localHighUsd,
      dropPct,
    }
  }

  return {
    ok: true,
    priceUsd,
    localHighUsd,
    dropPct,
    rule,
    hoursSinceLastFire: lastFireAt ? (Date.now() - lastFireAt) / 3600_000 : null,
  }
}

export function markDipFired(mint: string, at = Date.now()) {
  return patchMintDeskState(mint, { lastDipFireAt: at })
}

export type RaidGateOk = {
  ok: true
  quest: RaidQuest
  hoursSinceLastClaim: number | null
}

export type RaidGateErr = {
  ok: false
  error: string
  code: 'mode' | 'quest' | 'proof' | 'cooldown'
  retryAt?: number
}

export type RaidGate = RaidGateOk | RaidGateErr

const RAID_CLAIM_COOLDOWN_HOURS = 1

/**
 * Raid claim gate: quest must exist, proof kind required, per-quest cooldown.
 * `proofUrl` must look like an http(s) link or non-empty reference (≥8 chars).
 */
export function evaluateRaidGate(
  coin: CoinRecord,
  opts: { questId?: string; proofUrl?: string; force?: boolean },
): RaidGate {
  if (coin.mode !== 'raid') {
    return { ok: false, code: 'mode', error: 'Raid claims only work on Raid Pool coins.' }
  }
  const quests = coin.raidQuests ?? DEFAULT_RAID_QUESTS
  const quest = quests.find((q) => q.id === opts.questId) ?? quests[0]
  if (!quest) return { ok: false, code: 'quest', error: 'No raid quests configured.' }

  const proof = (opts.proofUrl || '').trim()
  if (!opts.force) {
    if (proof.length < 8) {
      return {
        ok: false,
        code: 'proof',
        error: `Attach proof for “${quest.title}” (${quest.proof}) — paste an https link or reference.`,
      }
    }
    if (/^https?:\/\//i.test(proof)) {
      try {
        const u = new URL(proof)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return { ok: false, code: 'proof', error: 'Proof URL must be http(s).' }
        }
      } catch {
        return { ok: false, code: 'proof', error: 'Proof URL is invalid.' }
      }
    }
  }

  const state = getMintDeskState(coin.mint)
  const last = state.lastRaidClaimAt?.[quest.id] || 0
  if (!opts?.force && last > 0) {
    const needMs = RAID_CLAIM_COOLDOWN_HOURS * 3600_000
    const elapsed = Date.now() - last
    if (elapsed < needMs) {
      return {
        ok: false,
        code: 'cooldown',
        error: `Quest cooldown · ${((needMs - elapsed) / 3600_000).toFixed(1)}h left.`,
        retryAt: last + needMs,
      }
    }
  }

  return {
    ok: true,
    quest,
    hoursSinceLastClaim: last ? (Date.now() - last) / 3600_000 : null,
  }
}

export function markRaidClaimed(mint: string, questId: string, at = Date.now()) {
  const prev = getMintDeskState(mint).lastRaidClaimAt || {}
  return patchMintDeskState(mint, {
    lastRaidClaimAt: { ...prev, [questId]: at },
  })
}

/** Test helper — wipe desk rule state. */
export function clearDeskStateForTests() {
  memoryState = {}
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(DESK_STATE_KEY)
  } catch {
    /* ignore */
  }
}
