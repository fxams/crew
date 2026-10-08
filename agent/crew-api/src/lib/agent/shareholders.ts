import { PublicKey } from '@solana/web3.js'
import {
  getPlatformBuybackWallet,
  MODE_DESK_BPS,
  PLATFORM_BUYBACK_BPS,
  type DeskMode,
} from './constants.js'
import type { CrewMember } from './narrative.js'

export type Shareholder = { wallet: string; bps: number }

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

export function buildCrewShareholders(
  crew: CrewMember[],
  mode: DeskMode,
  opts: { deskWallet: string; platformWallet?: string },
): Shareholder[] {
  const deskWallet = assertWallet(opts.deskWallet)
  const platformWallet = assertWallet(opts.platformWallet || getPlatformBuybackWallet())
  const platformBps = PLATFORM_BUYBACK_BPS
  const deskBps = MODE_DESK_BPS[mode]
  const crewPoolBps = 10_000 - platformBps - deskBps
  if (crewPoolBps < 0) throw new Error('Platform + desk reserves exceed 100% of fees.')

  const out: Shareholder[] = []
  out.push({ wallet: platformWallet, bps: platformBps })
  if (deskBps > 0) out.push({ wallet: deskWallet, bps: deskBps })

  const raw = crew.map((m) => ({
    member: m,
    bps: Math.floor((crewPoolBps * m.share) / 100),
  }))
  const allocated = raw.reduce((s, r) => s + r.bps, 0)
  let remainder = crewPoolBps - allocated
  const ordered = [...raw].sort((a, b) => b.bps - a.bps || a.member.handle.localeCompare(b.member.handle))
  for (const row of ordered) {
    if (remainder <= 0) break
    row.bps += 1
    remainder -= 1
  }
  for (const row of raw) {
    if (row.bps <= 0) continue
    out.push({ wallet: assertWallet(row.member.wallet), bps: row.bps })
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
