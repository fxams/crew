import { PublicKey } from '@solana/web3.js'
import {
  getPlatformBuybackWallet,
  MODE_DESK_BPS,
  PLATFORM_BUYBACK_BPS,
  PUMP_MAX_SHAREHOLDERS,
  REFERRAL_CUT_BPS,
  type DeskMode,
} from './constants.js'
import type { CrewMember } from './narrative.js'

export type Shareholder = {
  wallet: string
  bps: number
  role?: string
  handle?: string
  /** When role=referral, fold bps back to this KOL wallet if over Pump's cap. */
  foldToWallet?: string
}

export function assertWallet(value: string): string {
  const w = value.trim()
  try {
    return new PublicKey(w).toBase58()
  } catch {
    throw new Error(`Invalid Solana wallet: ${w.slice(0, 12)}…`)
  }
}

export function normalizeHandle(raw: string): string {
  const h = raw.trim().replace(/^@+/, '')
  if (!/^[a-z0-9_]{1,15}$/i.test(h)) {
    throw new Error(`Bad handle: ${raw}`)
  }
  return `@${h}`
}

export type ReferralCutInput = {
  handle: string
  referrerWallet: string
  referrerHandle?: string
}

function mergeShare(
  out: Shareholder[],
  wallet: string,
  bps: number,
  role?: string,
  handle?: string,
): void {
  const existing = out.find((s) => s.wallet === wallet)
  if (existing) {
    existing.bps += bps
    if (role === 'platform' || role === 'desk') {
      existing.role = role
      if (handle) existing.handle = handle
    } else if (role && existing.role !== 'platform' && existing.role !== 'desk') {
      existing.role = role
      if (handle) existing.handle = handle
    }
    return
  }
  out.push({ wallet, bps, role, handle })
}

/**
 * Apply direct-only referral cuts: 5% of each referred KOL's seat to their referrer.
 * Referral rows stay unmerged (foldToWallet tracked) so the Pump wallet cap can
 * fold each cut back into the correct KOL.
 */
export function applyDirectReferralSplits(
  crewRows: { handle: string; wallet: string; bps: number }[],
  cuts: ReferralCutInput[],
): Shareholder[] {
  const byHandle = new Map(
    cuts.map((c) => [c.handle.replace(/^@+/, '').toLowerCase(), c] as const),
  )
  const out: Shareholder[] = []

  for (const row of crewRows) {
    if (row.bps <= 0) continue
    const handle = row.handle.replace(/^@+/, '').toLowerCase()
    const cut = byHandle.get(handle)
    const kolWallet = assertWallet(row.wallet)
    if (!cut?.referrerWallet) {
      mergeShare(out, kolWallet, row.bps, 'crew', row.handle)
      continue
    }
    let refWallet: string
    try {
      refWallet = assertWallet(cut.referrerWallet)
    } catch {
      mergeShare(out, kolWallet, row.bps, 'crew', row.handle)
      continue
    }
    if (refWallet === kolWallet) {
      mergeShare(out, kolWallet, row.bps, 'crew', row.handle)
      continue
    }
    const refBps = Math.max(1, Math.floor((row.bps * REFERRAL_CUT_BPS) / 10_000))
    const kolBps = row.bps - refBps
    if (kolBps <= 0) {
      mergeShare(out, kolWallet, row.bps, 'crew', row.handle)
      continue
    }
    mergeShare(out, kolWallet, kolBps, 'crew', row.handle)
    // Keep separate referral rows so fold-back targets the right KOL.
    out.push({
      wallet: refWallet,
      bps: refBps,
      role: 'referral',
      handle: cut.referrerHandle
        ? `@${cut.referrerHandle.replace(/^@+/, '')}`
        : '@referral',
      foldToWallet: kolWallet,
    })
  }

  return out
}

/** Fold smallest referral seats back into their source KOL until ≤ max unique wallets. */
export function foldReferralOverflow(
  shares: Shareholder[],
  maxWallets = PUMP_MAX_SHAREHOLDERS,
): Shareholder[] {
  const out = shares.map((s) => ({ ...s }))
  const uniqueCount = () => new Set(out.map((s) => s.wallet)).size

  while (uniqueCount() > maxWallets) {
    let smallestIdx = -1
    let smallestBps = Infinity
    for (let i = 0; i < out.length; i += 1) {
      const row = out[i]!
      if (row.role !== 'referral') continue
      if (row.bps < smallestBps) {
        smallestBps = row.bps
        smallestIdx = i
      }
    }
    if (smallestIdx < 0) break
    const ref = out[smallestIdx]!
    out.splice(smallestIdx, 1)
    const targetWallet = ref.foldToWallet
    const kol =
      (targetWallet && out.find((s) => s.wallet === targetWallet && s.role === 'crew')) ||
      out.find((s) => s.role === 'crew') ||
      out[0]
    if (kol) kol.bps += ref.bps
  }

  // Merge duplicate wallets after folds.
  const merged: Shareholder[] = []
  for (const row of out) {
    mergeShare(merged, row.wallet, row.bps, row.role, row.handle)
  }
  return merged
}

export function buildCrewShareholders(
  crew: CrewMember[],
  mode: DeskMode,
  opts: {
    deskWallet: string
    platformWallet?: string
    referralCuts?: ReferralCutInput[]
  },
): Shareholder[] {
  const deskWallet = assertWallet(opts.deskWallet)
  const platformWallet = assertWallet(opts.platformWallet || getPlatformBuybackWallet())
  const platformBps = PLATFORM_BUYBACK_BPS
  const deskBps = MODE_DESK_BPS[mode]
  const crewPoolBps = 10_000 - platformBps - deskBps
  if (crewPoolBps < 0) throw new Error('Platform + desk reserves exceed 100% of fees.')

  const raw = crew.map((m) => ({
    handle: m.handle,
    wallet: m.wallet,
    bps: Math.floor((crewPoolBps * m.share) / 100),
  }))
  const allocated = raw.reduce((s, r) => s + r.bps, 0)
  let remainder = crewPoolBps - allocated
  const ordered = [...raw].sort(
    (a, b) => b.bps - a.bps || a.handle.localeCompare(b.handle),
  )
  for (const row of ordered) {
    if (remainder <= 0) break
    row.bps += 1
    remainder -= 1
  }

  const crewShares = applyDirectReferralSplits(raw, opts.referralCuts || [])

  const staged: Shareholder[] = []
  staged.push({ wallet: platformWallet, bps: platformBps, role: 'platform', handle: '@crew-buyback' })
  if (deskBps > 0) {
    mergeShare(staged, deskWallet, deskBps, 'desk', mode === 'agent' ? '@agent' : '@desk')
  }
  for (const row of crewShares) {
    if (row.role === 'referral') {
      staged.push({ ...row })
    } else {
      mergeShare(staged, row.wallet, row.bps, row.role, row.handle)
    }
  }

  const out = foldReferralOverflow(staged, PUMP_MAX_SHAREHOLDERS)
  if (out.length > PUMP_MAX_SHAREHOLDERS) {
    throw new Error(
      `Fee-share has ${out.length} wallets — Pump allows ${PUMP_MAX_SHAREHOLDERS}. Reduce crew seats.`,
    )
  }

  const total = out.reduce((s, r) => s + r.bps, 0)
  if (total !== 10_000) throw new Error(`Shareholder bps must total 10000 (got ${total}).`)
  return out
}

export function normalizeCrew(
  crew: CrewMember[],
  mode: DeskMode,
): CrewMember[] {
  if (crew.length < 1 || crew.length > 10) {
    throw new Error('Crew must have 1–10 members.')
  }
  const seenHandles = new Set<string>()
  const seenWallets = new Set<string>()
  let shareSum = 0
  const out: CrewMember[] = []
  for (const member of crew) {
    const handle = normalizeHandle(member.handle)
    if (seenHandles.has(handle)) throw new Error(`Duplicate ${handle}`)
    seenHandles.add(handle)
    const share = Math.round(Number(member.share) || 0)
    if (share <= 0 || share > 100) throw new Error(`Bad share for ${handle}`)
    shareSum += share
    const wallet = assertWallet(member.wallet)
    if (seenWallets.has(wallet)) throw new Error(`Duplicate wallet ${wallet}`)
    seenWallets.add(wallet)
    const hireRole = member.hireRole
    if (mode === 'agent' && !hireRole) {
      throw new Error(`Assign hireRole for ${handle} in agent mode.`)
    }
    out.push({ handle, wallet, share, hireRole })
  }
  if (shareSum !== 100) throw new Error(`Crew shares must total 100% (now ${shareSum}%).`)
  return out
}
