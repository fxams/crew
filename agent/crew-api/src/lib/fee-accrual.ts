/**
 * Near-realtime per-mint creator-fee accrual.
 * Polls remits + on-chain fee-sharing / unclaimed creator fees every 1–5 min and caches.
 * Budget uses THIS coin's accrued fees only.
 */

import { PublicKey } from '@solana/web3.js'
import { clampTtlMs } from './fx.js'

const DEFAULT_TTL_MS = 120_000
const SYSTEM = '11111111111111111111111111111111'

export type FeeAccrual = {
  mint: string
  accruedSol: number
  accruedEth: number
  distributedSol: number
  unclaimedSol: number | null
  unclaimedEth: number | null
  sharingConfig: boolean
  at: number
  ttlMs: number
  source: 'cache' | 'remits' | 'remits+chain' | 'injected'
}

export type ChainAccrual = {
  unclaimedSol: number | null
  unclaimedEth: number | null
  sharingConfig: boolean
}

export type AccrualDeps = {
  distributedSol?: (mint: string) => Promise<number>
  chain?: (mint: string) => Promise<ChainAccrual>
  now?: () => number
}

const cache = new Map<string, FeeAccrual>()
let deps: AccrualDeps = {}
let poller: ReturnType<typeof setInterval> | null = null

export function accrualTtlMs(): number {
  return clampTtlMs('KICKOFF_ACCRUAL_TTL_MS', DEFAULT_TTL_MS)
}

export function resetFeeAccrual() {
  cache.clear()
}

export function setFeeAccrualDeps(next: AccrualDeps) {
  deps = next
}

export function peekFeeAccrual(mint: string): FeeAccrual | null {
  return cache.get(mint) || null
}

export function seedFeeAccrual(row: FeeAccrual) {
  cache.set(row.mint, row)
}

export async function getAccruedFees(
  mint: string,
  opts?: { force?: boolean; now?: number },
): Promise<FeeAccrual> {
  const key = mint.trim()
  const now = opts?.now ?? deps.now?.() ?? Date.now()
  const ttl = accrualTtlMs()
  const hit = cache.get(key)
  if (!opts?.force && hit && now - hit.at < ttl) {
    return { ...hit, source: 'cache' }
  }
  return refreshAccrual(key, now)
}

export async function refreshAccrual(mint: string, now = Date.now()): Promise<FeeAccrual> {
  const ttl = accrualTtlMs()
  const distributedSol = await readDistributedSol(mint)
  let unclaimedSol: number | null = null
  let unclaimedEth: number | null = null
  let sharingConfig = false
  let usedChain = false
  try {
    const chain = await readChain(mint)
    unclaimedSol = chain.unclaimedSol
    unclaimedEth = chain.unclaimedEth
    sharingConfig = chain.sharingConfig
    usedChain = chain.unclaimedSol != null || chain.unclaimedEth != null || chain.sharingConfig
  } catch {
    /* keep remits-only */
  }
  const accruedSol = round9(distributedSol + Math.max(0, unclaimedSol || 0))
  const accruedEth = round9(Math.max(0, unclaimedEth || 0))
  const row: FeeAccrual = {
    mint,
    accruedSol,
    accruedEth,
    distributedSol: round9(distributedSol),
    unclaimedSol,
    unclaimedEth,
    sharingConfig,
    at: now,
    ttlMs: ttl,
    source: usedChain ? 'remits+chain' : 'remits',
  }
  cache.set(mint, row)
  return row
}

export function shouldStartAccrualPoller(): boolean {
  if (process.env.VITEST) return false
  if (process.env.NODE_ENV === 'test') return false
  const v = (process.env.KICKOFF_ACCRUAL_POLL || '').trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'off') return false
  return true
}

export function startFeeAccrualPoller(): void {
  if (!shouldStartAccrualPoller()) return
  if (poller) return
  const tick = () => {
    void warmAllAccruals().catch((err) => {
      console.warn('[kickoff-accrual] poll failed', err instanceof Error ? err.message : err)
    })
  }
  poller = setInterval(tick, accrualTtlMs())
  if (typeof poller.unref === 'function') poller.unref()
  tick()
}

export async function warmAllAccruals(): Promise<number> {
  const { listCoins } = await import('./coins.js')
  const coins = await listCoins(100)
  let n = 0
  for (const coin of coins) {
    try {
      await getAccruedFees(coin.mint, { force: true })
      n += 1
    } catch {
      /* skip mint */
    }
  }
  return n
}

async function readDistributedSol(mint: string): Promise<number> {
  if (deps.distributedSol) return Math.max(0, Number(await deps.distributedSol(mint)) || 0)
  try {
    const { listRemits } = await import('./coins.js')
    const remits = await listRemits(500, { mint })
    return remits.reduce((n, r) => n + (Number(r.amountSol) || 0), 0)
  } catch {
    return 0
  }
}

async function readChain(mint: string): Promise<ChainAccrual> {
  if (deps.chain) return deps.chain(mint)
  return fetchChainAccrual(mint)
}

/** Best-effort: sharing-config presence + unclaimed creator fees (lamports → SOL). */
export async function fetchChainAccrual(mint: string): Promise<ChainAccrual> {
  const empty: ChainAccrual = { unclaimedSol: null, unclaimedEth: null, sharingConfig: false }
  let mintPk: PublicKey
  try {
    mintPk = new PublicKey(mint)
  } catch {
    return empty
  }
  try {
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pump = require('@pump-fun/pump-sdk') as typeof import('@pump-fun/pump-sdk')
    const { getConnection } = await import('./agent/send.js')
    const { OnlinePumpSdk } = await import('./agent/pump.js')
    const connection = getConnection()
    const sharingPda = pump.feeSharingConfigPda(mintPk)
    const info = await connection.getAccountInfo(sharingPda)
    const sharingConfig = Boolean(info)
    let unclaimedSol = 0
    let found = false
    try {
      const online = new OnlinePumpSdk(connection)
      const curve = await online.fetchBondingCurve(mintPk)
      const fromCurve = pickLamports(curve)
      if (fromCurve != null) {
        unclaimedSol += fromCurve
        found = true
      }
      try {
        const minFee = await online.getMinimumDistributableFee(mintPk, new PublicKey(SYSTEM), {
          quoteMint: (await import('@solana/spl-token')).NATIVE_MINT,
        })
        const fromMin = pickLamports(minFee)
        if (fromMin != null) {
          unclaimedSol = Math.max(unclaimedSol, fromMin)
          found = true
        }
      } catch {
        /* view optional */
      }
    } catch {
      /* curve optional */
    }
    return {
      unclaimedSol: found ? round9(unclaimedSol) : null,
      unclaimedEth: null,
      sharingConfig,
    }
  } catch {
    return empty
  }
}

function pickLamports(obj: unknown): number | null {
  if (obj == null) return null
  if (typeof obj === 'number' && Number.isFinite(obj) && obj >= 0) {
    return obj > 1e6 ? obj / 1e9 : obj
  }
  if (typeof obj === 'bigint' && obj >= 0n) return Number(obj) / 1e9
  if (typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  for (const k of [
    'creatorFee',
    'creator_fee',
    'creatorFees',
    'unsweptCreatorFee',
    'amountLamports',
    'lamports',
    'distributableLamports',
    'feeLamports',
  ]) {
    const n = toSol(o[k])
    if (n != null) return n
  }
  return null
}

function toSol(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'bigint' && v >= 0n) return Number(v) / 1e9
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v > 1e6 ? v / 1e9 : v
  if (typeof v === 'object' && v && 'toNumber' in v) {
    try {
      const n = Number((v as { toNumber: () => number }).toNumber())
      if (Number.isFinite(n) && n >= 0) return n / 1e9
    } catch {
      return null
    }
  }
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v) / 1e9
  return null
}

function round9(n: number): number {
  return Number(Math.max(0, n).toFixed(9))
}
