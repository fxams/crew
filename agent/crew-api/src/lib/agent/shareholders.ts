import { PublicKey } from '@solana/web3.js'
import {
  AGENT_REFERRAL_BPS,
  getPlatformBuybackWallet,
  MAX_CREW_REFERRED,
  MAX_CREW_UNREFERRED,
  MODE_DESK_BPS,
  platformBuybackBps,
  PUMP_MAX_SHAREHOLDERS,
  type DeskMode,
} from './constants.js'
import type { CrewMember } from './narrative.js'

export type Shareholder = {
  wallet: string
  bps: number
  role?: string
  handle?: string
}

export type AgentReferrerInput = {
  wallet: string
  handle?: string
  code?: string
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

/**
 * Max hired-KOL seats for agent-mode fee maps.
 * Pump allows 10 wallets: treasury + agent (+ referrer) + crew.
 */
export function maxCrewSeats(opts: { hasAgentReferrer: boolean; mode?: DeskMode }): number {
  const mode = opts.mode || 'agent'
  if (mode !== 'agent') return MAX_CREW_UNREFERRED
  return opts.hasAgentReferrer ? MAX_CREW_REFERRED : MAX_CREW_UNREFERRED
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
    if (role === 'platform' || role === 'desk' || role === 'agent-referral') {
      if (existing.role !== 'platform') {
        existing.role = role
        if (handle) existing.handle = handle
      }
    } else if (
      role &&
      existing.role !== 'platform' &&
      existing.role !== 'desk' &&
      existing.role !== 'agent-referral'
    ) {
      existing.role = role
      if (handle) existing.handle = handle
    }
    return
  }
  out.push({ wallet, bps, role, handle })
}

/** Handles in crew that match the agent referrer wallet. */
export function agentReferrerDualRoleHandles(
  crew: CrewMember[],
  agentReferrerWallet: string | null | undefined,
): string[] {
  if (!agentReferrerWallet) return []
  let ref: string
  try {
    ref = assertWallet(agentReferrerWallet)
  } catch {
    return []
  }
  return crew
    .filter((m) => {
      try {
        return assertWallet(m.wallet) === ref
      } catch {
        return false
      }
    })
    .map((m) => m.handle)
}

export function buildCrewShareholders(
  crew: CrewMember[],
  mode: DeskMode,
  opts: {
    deskWallet: string
    platformWallet?: string
    /** Agent-key referrer — 5% of total fees (from treasury). Skipped if also in crew. */
    agentReferrer?: AgentReferrerInput | null
  },
): Shareholder[] {
  const deskWallet = assertWallet(opts.deskWallet)
  const platformWallet = assertWallet(opts.platformWallet || getPlatformBuybackWallet())

  let agentReferrerWallet: string | null = null
  let agentReferrerHandle = '@referrer'
  if (opts.agentReferrer?.wallet) {
    agentReferrerWallet = assertWallet(opts.agentReferrer.wallet)
    if (opts.agentReferrer.handle) {
      agentReferrerHandle = opts.agentReferrer.handle.startsWith('@')
        ? opts.agentReferrer.handle
        : `@${opts.agentReferrer.handle}`
    }
  }

  // Referrer also in crew → no referral cut (crew seat only).
  const dualHandles = agentReferrerDualRoleHandles(crew, agentReferrerWallet)
  const applyReferrer = Boolean(agentReferrerWallet) && dualHandles.length === 0

  const maxSeats = maxCrewSeats({ hasAgentReferrer: applyReferrer, mode })
  if (crew.length > maxSeats) {
    throw new Error(
      applyReferrer
        ? `Crew has ${crew.length} seats — referred launches allow at most ${maxSeats} (Pump cap ${PUMP_MAX_SHAREHOLDERS}: crew + agent + referrer + treasury).`
        : `Crew has ${crew.length} seats — max ${maxSeats} for this fee map (Pump cap ${PUMP_MAX_SHAREHOLDERS} wallets).`,
    )
  }

  const platformBps = platformBuybackBps(applyReferrer)
  const agentReferralBps = applyReferrer ? AGENT_REFERRAL_BPS : 0
  const deskBps = MODE_DESK_BPS[mode]
  const crewPoolBps = 10_000 - platformBps - agentReferralBps - deskBps
  if (crewPoolBps < 0) throw new Error('Platform + desk + referral reserves exceed 100% of fees.')

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

  const staged: Shareholder[] = []
  staged.push({
    wallet: platformWallet,
    bps: platformBps,
    role: 'platform',
    handle: '@crew-buyback',
  })
  if (applyReferrer && agentReferrerWallet && agentReferralBps > 0) {
    mergeShare(staged, agentReferrerWallet, agentReferralBps, 'agent-referral', agentReferrerHandle)
  }
  if (deskBps > 0) {
    mergeShare(staged, deskWallet, deskBps, 'desk', mode === 'agent' ? '@agent' : '@desk')
  }
  for (const row of raw) {
    if (row.bps <= 0) continue
    mergeShare(staged, assertWallet(row.wallet), row.bps, 'crew', row.handle)
  }

  const uniqueWallets = new Set(staged.map((s) => s.wallet)).size
  if (uniqueWallets > PUMP_MAX_SHAREHOLDERS) {
    throw new Error(
      `Fee-share has ${uniqueWallets} wallets — Pump allows ${PUMP_MAX_SHAREHOLDERS}. Reduce crew seats` +
        (applyReferrer ? ' (referred max 7).' : '.'),
    )
  }

  const total = staged.reduce((s, r) => s + r.bps, 0)
  if (total !== 10_000) throw new Error(`Shareholder bps must total 10000 (got ${total}).`)
  return staged
}

export function normalizeCrew(
  crew: CrewMember[],
  mode: DeskMode,
  opts?: { maxSeats?: number },
): CrewMember[] {
  const maxSeats = opts?.maxSeats ?? MAX_CREW_UNREFERRED
  if (crew.length < 1 || crew.length > maxSeats) {
    throw new Error(`Crew must have 1–${maxSeats} members.`)
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
