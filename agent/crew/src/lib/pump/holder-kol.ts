/**
 * Pure helpers: top holders ∩ CREW KOL directory → fee-share bps.
 * On-chain Pump fee-share allows at most 10 shareholders and can be locked once.
 */

import type { CrewMember, DeskMode } from '../types'
import { MODE_DESK_BPS } from '../config'
import type { KolRecord } from './kol-directory'
import { KOL_DB } from './kol-directory'

/** Pump program hard cap. */
export const PUMP_MAX_SHAREHOLDERS = 10

/** Match Solana RPC top token accounts page size. */
export const TOP_HOLDER_ACCOUNTS = 20

export type HolderRow = {
  /** Token account (ATA) address. */
  tokenAccount: string
  /** Wallet that owns the ATA. */
  owner: string
  /** Raw token amount (smallest units as string). */
  amount: string
  uiAmount: number
}

export type HolderKolMatch = {
  wallet: string
  handle: string
  pump: string
  x: string | null
  rank: number
  followers: number
  amount: string
  uiAmount: number
  /** Share of matched-KOL pool in whole percent (crew display). */
  share: number
  /** On-chain bps of total creator fees (after desk reserve). */
  bps: number
}

export type HolderKolProposal = {
  matches: HolderKolMatch[]
  /** Full shareholder list for updateFeeSharesV2 (includes desk if any). */
  shareholders: { wallet: string; bps: number; handle: string; role: 'crew' | 'desk' }[]
  /** Crew rows for board UI (KOL matches only, shares sum to 100). */
  crew: CrewMember[]
  deskBps: number
  matchedBalance: number
  scannedHolders: number
  excludedVaults: number
  at: number
}

const WALLET_INDEX = (() => {
  const map = new Map<string, KolRecord>()
  for (const row of KOL_DB) {
    if (row.wallet) map.set(row.wallet, row)
  }
  return map
})()

export function lookupKolByWallet(wallet: string): KolRecord | null {
  return WALLET_INDEX.get(wallet) ?? null
}

/** Build excluded owner set (bonding curve, sharing config, pool authority, etc.). */
export function isExcludedVaultOwner(owner: string, vaultOwners: Set<string>): boolean {
  return vaultOwners.has(owner)
}

/**
 * Intersect top holders with the 1500 KOL DB and allocate crew-pool bps by balance.
 * Caps at Pump's 10-shareholder limit (desk reserve takes one slot when > 0).
 */
export function proposeHolderKolShares(opts: {
  holders: HolderRow[]
  mode: DeskMode
  deskWallet?: string
  vaultOwners?: Set<string>
  /** Max KOL recipients after desk slot. Default fills Pump cap. */
  maxKols?: number
}): HolderKolProposal {
  const deskBps = MODE_DESK_BPS[opts.mode]
  const deskSlots = deskBps > 0 && opts.deskWallet ? 1 : 0
  const maxKols = Math.min(
    opts.maxKols ?? PUMP_MAX_SHAREHOLDERS - deskSlots,
    PUMP_MAX_SHAREHOLDERS - deskSlots,
  )
  if (maxKols < 1) {
    throw new Error('No shareholder slots left after desk reserve.')
  }

  const vaults = opts.vaultOwners ?? new Set<string>()
  let excludedVaults = 0
  const byWallet = new Map<string, HolderRow>()

  for (const row of opts.holders) {
    if (!row.owner || row.uiAmount <= 0) continue
    if (vaults.has(row.owner)) {
      excludedVaults += 1
      continue
    }
    const prior = byWallet.get(row.owner)
    if (!prior) {
      byWallet.set(row.owner, { ...row })
      continue
    }
    byWallet.set(row.owner, {
      ...prior,
      amount: (BigInt(prior.amount) + BigInt(row.amount)).toString(),
      uiAmount: prior.uiAmount + row.uiAmount,
    })
  }

  const matched: { kol: KolRecord; row: HolderRow }[] = []
  for (const [wallet, row] of byWallet) {
    const kol = WALLET_INDEX.get(wallet)
    if (!kol) continue
    matched.push({ kol, row })
  }

  matched.sort((a, b) => b.row.uiAmount - a.row.uiAmount)
  const top = matched.slice(0, maxKols)
  const matchedBalance = top.reduce((s, m) => s + m.row.uiAmount, 0)
  const crewPoolBps = 10_000 - deskBps

  const raw = top.map((m) => {
    const bps =
      matchedBalance > 0
        ? Math.floor((crewPoolBps * m.row.uiAmount) / matchedBalance)
        : 0
    return { ...m, bps }
  })

  let allocated = raw.reduce((s, r) => s + r.bps, 0)
  if (raw.length && allocated !== crewPoolBps && matchedBalance > 0) {
    raw.sort((a, b) => b.bps - a.bps || b.row.uiAmount - a.row.uiAmount)[0].bps +=
      crewPoolBps - allocated
    allocated = crewPoolBps
  }

  const matches: HolderKolMatch[] = raw
    .filter((r) => r.bps > 0)
    .map((r) => {
      const share =
        crewPoolBps > 0 ? Math.round((r.bps / crewPoolBps) * 100) : 0
      const handle = r.kol.x ? `@${r.kol.x}` : `@${r.kol.pump}`
      return {
        wallet: r.kol.wallet,
        handle,
        pump: r.kol.pump,
        x: r.kol.x,
        rank: r.kol.rank,
        followers: r.kol.followers,
        amount: r.row.amount,
        uiAmount: r.row.uiAmount,
        share,
        bps: r.bps,
      }
    })

  // Fix display % to sum 100 when we have matches.
  if (matches.length) {
    const shareSum = matches.reduce((s, m) => s + m.share, 0)
    if (shareSum !== 100) {
      matches.sort((a, b) => b.share - a.share)[0].share += 100 - shareSum
    }
  }

  const shareholders: HolderKolProposal['shareholders'] = matches.map((m) => ({
    wallet: m.wallet,
    bps: m.bps,
    handle: m.handle,
    role: 'crew' as const,
  }))

  if (deskBps > 0 && opts.deskWallet) {
    const deskHandle =
      opts.mode === 'agent'
        ? '@agent'
        : opts.mode === 'raid'
          ? '@raid'
          : opts.mode === 'buyback'
            ? '@buyback'
            : '@desk'
    const existing = shareholders.find((s) => s.wallet === opts.deskWallet)
    if (existing) {
      existing.bps += deskBps
      existing.role = 'desk'
      if (opts.mode === 'agent') existing.handle = '@agent'
    } else {
      shareholders.unshift({
        wallet: opts.deskWallet,
        bps: deskBps,
        handle: deskHandle,
        role: 'desk',
      })
    }
  }

  const total = shareholders.reduce((s, r) => s + r.bps, 0)
  if (shareholders.length && total !== 10_000) {
    throw new Error(`Holder KOL share map must total 10000 bps (got ${total}).`)
  }
  if (shareholders.length > PUMP_MAX_SHAREHOLDERS) {
    throw new Error(`Pump allows at most ${PUMP_MAX_SHAREHOLDERS} shareholders.`)
  }

  const crew: CrewMember[] = matches.map((m) => ({
    handle: m.handle,
    wallet: m.wallet,
    share: m.share,
    hireRole: 'kol',
  }))

  return {
    matches,
    shareholders,
    crew,
    deskBps,
    matchedBalance,
    scannedHolders: byWallet.size,
    excludedVaults,
    at: Date.now(),
  }
}
