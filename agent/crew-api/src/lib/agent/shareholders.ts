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
import { assertEvmAddress } from './evm-address.js'
import {
  BAGS_MAX_CLAIMERS,
  type LaunchPlatform,
  maxClaimersForPlatform,
} from './platforms.js'
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

/** Canonical DB / attribution roles. Display aliases (kol, buyback, …) normalize here. */
export function normalizeShareholderRole(role?: string | null): string {
  const r = (role || 'crew').trim().toLowerCase().slice(0, 32)
  if (r === 'kol' || r === 'hired' || r === 'hire') return 'crew'
  if (r === 'buyback' || r === 'treasury') return 'platform'
  if (r === 'launcher-ops' || r === 'launcher' || r === 'agent') return 'desk'
  if (r === 'referral') return 'agent-referral'
  return r || 'crew'
}

export type AddressChain = 'solana' | 'evm'

export function assertWallet(value: string, chain: AddressChain = 'solana'): string {
  const w = value.trim()
  if (chain === 'evm') return assertEvmAddress(w, 'wallet')
  try {
    return new PublicKey(w).toBase58()
  } catch {
    throw new Error(`Invalid Solana wallet: ${w.slice(0, 12)}…`)
  }
}

/** True when an address can receive an on-chain payout (never treat empty as a destination). */
export function isPayoutWallet(value: string | null | undefined, chain: AddressChain = 'solana'): boolean {
  const w = (value || '').trim()
  if (chain === 'evm') {
    try {
      assertEvmAddress(w, 'wallet')
      return true
    } catch {
      return false
    }
  }
  if (w.length < 32 || w.length > 64) return false
  try {
    new PublicKey(w)
    return true
  } catch {
    return false
  }
}

/**
 * Drop KOLs who have no payout wallet, then renormalize remaining shares to 100%.
 * Their seat is held (not sent to an empty address) until they add a wallet.
 */
export function skipCrewWithoutPayoutWallets(
  crew: CrewMember[],
  chain: AddressChain = 'solana',
): { crew: CrewMember[]; skipped: string[]; heldShare: number } {
  const kept: CrewMember[] = []
  const skipped: string[] = []
  let heldShare = 0
  for (const member of crew) {
    if (isPayoutWallet(member.wallet, chain)) {
      kept.push(member)
      continue
    }
    skipped.push(member.handle)
    heldShare += Math.max(0, Number(member.share) || 0)
  }
  if (!kept.length) {
    return { crew: [], skipped, heldShare }
  }
  if (!skipped.length) {
    return { crew: kept, skipped, heldShare }
  }
  const sum = kept.reduce((s, m) => s + Math.max(0, Number(m.share) || 0), 0)
  if (sum <= 0) {
    const share = Math.floor(100 / kept.length)
    const rem = 100 - share * kept.length
    return {
      crew: kept.map((m, i) => ({ ...m, share: share + (i < rem ? 1 : 0) })),
      skipped,
      heldShare,
    }
  }
  const raw = kept.map((m) => ({
    ...m,
    share: Math.floor((100 * Math.max(0, Number(m.share) || 0)) / sum),
  }))
  let allocated = raw.reduce((s, m) => s + m.share, 0)
  let i = 0
  while (allocated < 100 && raw.length) {
    raw[i % raw.length]!.share += 1
    allocated += 1
    i += 1
  }
  return { crew: raw, skipped, heldShare }
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
 * Dual-role (referrer also in crew) does not add a wallet → unreferred cap.
 */
export function maxCrewSeats(opts: {
  hasAgentReferrer: boolean
  mode?: DeskMode
  /** Referrer wallet is also a crew seat — no extra Pump wallet. */
  referrerInCrew?: boolean
  platform?: LaunchPlatform
}): number {
  const platform = opts.platform || 'pumpfun'
  if (platform === 'bags') {
    const reserved = 2 + (opts.hasAgentReferrer && !opts.referrerInCrew ? 1 : 0)
    return Math.max(1, BAGS_MAX_CLAIMERS - reserved)
  }
  if (platform === 'zora') {
    const reserved = 2 + (opts.hasAgentReferrer && !opts.referrerInCrew ? 1 : 0)
    return Math.max(1, 40 - reserved)
  }
  const mode = opts.mode || 'agent'
  if (mode !== 'agent') return MAX_CREW_UNREFERRED
  if (opts.referrerInCrew) return MAX_CREW_UNREFERRED
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
  chain: AddressChain = 'solana',
): string[] {
  if (!agentReferrerWallet) return []
  let ref: string
  try {
    ref = assertWallet(agentReferrerWallet, chain)
  } catch {
    return []
  }
  return crew
    .filter((m) => {
      try {
        return assertWallet(m.wallet, chain) === ref
      } catch {
        return false
      }
    })
    .map((m) => m.handle)
}

function allocateCrewPool(
  crew: CrewMember[],
  crewPoolBps: number,
): Array<{ handle: string; wallet: string; bps: number }> {
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
  return raw
}

/**
 * Map platform + desk + optional agent-referral into on-chain shareholder bps.
 * Dual-role (referrer also hired): pay max(crew seat, 5% referral) — a tiny seat
 * cannot dodge the referral floor.
 */
export function buildCrewShareholders(
  crew: CrewMember[],
  mode: DeskMode,
  opts: {
    deskWallet: string
    platformWallet?: string
    /** Agent-key referrer — 5% of total fees (from treasury), or floor when also in crew. */
    agentReferrer?: AgentReferrerInput | null
    /** Optional per-launch treasury override in bps (defaults to PLATFORM_BUYBACK_BPS). Clamped server-side. */
    treasuryBpsOverride?: number | null
    /** Solana (Pump/Bags) or EVM (Zora / 0xSplits). */
    chain?: AddressChain
    /** Cap unique recipients (Pump 10, Bags 100, Zora/0xSplits 100). */
    maxShareholders?: number
    platform?: LaunchPlatform
  },
): Shareholder[] {
  const chain = opts.chain || 'solana'
  const cap =
    opts.maxShareholders ??
    maxClaimersForPlatform(opts.platform || (chain === 'evm' ? 'zora' : 'pumpfun'))
  if (chain === 'evm' && !opts.platformWallet) {
    throw new Error('EVM fee-share requires platformWallet (Zora treasury / 0xSplits recipient).')
  }
  const deskWallet = assertWallet(opts.deskWallet, chain)
  const platformWallet = assertWallet(
    opts.platformWallet || getPlatformBuybackWallet(),
    chain,
  )

  let agentReferrerWallet: string | null = null
  let agentReferrerHandle = '@referrer'
  if (opts.agentReferrer?.wallet) {
    agentReferrerWallet = assertWallet(opts.agentReferrer.wallet, chain)
    if (opts.agentReferrer.handle) {
      agentReferrerHandle = opts.agentReferrer.handle.startsWith('@')
        ? opts.agentReferrer.handle
        : `@${opts.agentReferrer.handle}`
    }
  }

  const dualHandles = agentReferrerDualRoleHandles(crew, agentReferrerWallet, chain)
  const dualRole = Boolean(agentReferrerWallet) && dualHandles.length > 0
  const separateReferrer = Boolean(agentReferrerWallet) && !dualRole

  const maxSeats = maxCrewSeats({
    hasAgentReferrer: separateReferrer,
    referrerInCrew: dualRole,
    mode,
    platform: opts.platform || (chain === 'evm' ? 'zora' : 'pumpfun'),
  })
  if (crew.length > maxSeats) {
    throw new Error(
      separateReferrer
        ? `Crew has ${crew.length} seats — referred launches allow at most ${maxSeats} (recipient cap ${cap}: crew + agent + referrer + treasury).`
        : `Crew has ${crew.length} seats — max ${maxSeats} for this fee map (recipient cap ${cap} wallets).`,
    )
  }

  const deskBps = MODE_DESK_BPS[mode]

  // Dual-role: start from non-referred map, then enforce max(seat, 5% referral).
  if (dualRole && agentReferrerWallet) {
    const baseTreasury = opts.treasuryBpsOverride ?? null
    const platformBps = baseTreasury != null ? baseTreasury : platformBuybackBps(false)
    const crewPoolBps = 10_000 - platformBps - deskBps
    if (crewPoolBps < 0) throw new Error('Platform + desk reserves exceed 100% of fees.')
    const raw = allocateCrewPool(crew, crewPoolBps)
    const refRow = raw.find((r) => assertWallet(r.wallet, chain) === agentReferrerWallet)
    const crewSeatBps = refRow?.bps ?? 0
    const target = Math.max(crewSeatBps, AGENT_REFERRAL_BPS)
    let platformFinal = platformBps
    if (target > crewSeatBps && refRow) {
      const topUp = target - crewSeatBps
      platformFinal = platformBps - topUp
      if (platformFinal < 0) throw new Error('Referral floor exceeds platform reserve.')
      refRow.bps = target
    }

    const staged: Shareholder[] = []
    staged.push({
      wallet: platformWallet,
      bps: platformFinal,
      role: 'platform',
      handle: '@crew-buyback',
    })
    if (deskBps > 0) {
      mergeShare(staged, deskWallet, deskBps, 'desk', mode === 'agent' ? '@agent' : '@desk')
    }
    for (const row of raw) {
      if (row.bps <= 0) continue
      const w = assertWallet(row.wallet, chain)
      if (w === agentReferrerWallet && target > crewSeatBps) {
        // Topped up to referral floor — attribute as agent-referral for earnings.
        mergeShare(staged, w, row.bps, 'agent-referral', agentReferrerHandle)
      } else {
        mergeShare(staged, w, row.bps, 'crew', row.handle)
      }
    }

    const uniqueWallets = new Set(staged.map((s) => s.wallet)).size
    if (uniqueWallets > cap) {
      throw new Error(
        `Fee-share has ${uniqueWallets} wallets — this platform allows ${cap}. Reduce crew seats.`,
      )
    }
    const total = staged.reduce((s, r) => s + r.bps, 0)
    if (total !== 10_000) throw new Error(`Shareholder bps must total 10000 (got ${total}).`)
    return staged
  }

  const baseTreasury = opts.treasuryBpsOverride ?? null
  const platformBps =
    baseTreasury != null
      ? separateReferrer
        ? Math.max(0, baseTreasury - AGENT_REFERRAL_BPS)
        : baseTreasury
      : platformBuybackBps(separateReferrer)
  const agentReferralBps = separateReferrer ? AGENT_REFERRAL_BPS : 0
  const crewPoolBps = 10_000 - platformBps - agentReferralBps - deskBps
  if (crewPoolBps < 0) throw new Error('Platform + desk + referral reserves exceed 100% of fees.')

  const raw = allocateCrewPool(crew, crewPoolBps)

  const staged: Shareholder[] = []
  staged.push({
    wallet: platformWallet,
    bps: platformBps,
    role: 'platform',
    handle: '@crew-buyback',
  })
  if (separateReferrer && agentReferrerWallet && agentReferralBps > 0) {
    mergeShare(staged, agentReferrerWallet, agentReferralBps, 'agent-referral', agentReferrerHandle)
  }
  if (deskBps > 0) {
    mergeShare(staged, deskWallet, deskBps, 'desk', mode === 'agent' ? '@agent' : '@desk')
  }
  for (const row of raw) {
    if (row.bps <= 0) continue
    mergeShare(staged, assertWallet(row.wallet, chain), row.bps, 'crew', row.handle)
  }

  const uniqueWallets = new Set(staged.map((s) => s.wallet)).size
  if (uniqueWallets > cap) {
    throw new Error(
      `Fee-share has ${uniqueWallets} wallets — this platform allows ${cap}. Reduce crew seats` +
        (separateReferrer && cap === PUMP_MAX_SHAREHOLDERS ? ' (referred max 7).' : '.'),
    )
  }

  const total = staged.reduce((s, r) => s + r.bps, 0)
  if (total !== 10_000) throw new Error(`Shareholder bps must total 10000 (got ${total}).`)
  return staged
}

export function normalizeCrew(
  crew: CrewMember[],
  mode: DeskMode,
  opts?: { maxSeats?: number; chain?: AddressChain },
): CrewMember[] {
  const maxSeats = opts?.maxSeats ?? MAX_CREW_UNREFERRED
  const chain = opts?.chain || 'solana'
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
    const wallet = assertWallet(member.wallet, chain)
    if (seenWallets.has(wallet)) throw new Error(`Duplicate wallet ${wallet}`)
    seenWallets.add(wallet)
    const hireRole = member.hireRole
    if (mode === 'agent' && !hireRole) {
      throw new Error(`Assign hireRole for ${handle} in agent mode.`)
    }
    const evmWallet = member.evmWallet?.trim()
      ? assertEvmAddress(member.evmWallet, 'evmWallet')
      : undefined
    out.push({ handle, wallet, share, hireRole, evmWallet })
  }
  if (shareSum !== 100) throw new Error(`Crew shares must total 100% (now ${shareSum}%).`)
  return out
}
