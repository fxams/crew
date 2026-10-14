/**
 * Delivery-gated crew payouts: accrue crew share, release only after promo verification.
 * Escrow uses jobs sim/devnet rails only (non-custodial). On-chain 60/15/25 map unchanged.
 */

import { coinPageUrl } from './coin-page.js'
import { deliveryGatedPayoutsEnabled, promoMinEngagement, promoPostWindowHours, promoStillLiveAfterHours } from './delivery-gated-config.js'
import { memoryJobs } from './jobs/store.js'
import { runTaskAutoChecks, type UrlReachabilityChecker } from './jobs/task-checks.js'
import { processAutoReleases } from './jobs/tasks-flow.js'
import { parseAmountToBigint, nowMs, type TaskAutoChecks } from './jobs/types.js'
import type { CrewMember } from './agent/narrative.js'
import { recordVerifiedJobCompletion } from './kol-reputation.js'

export type CrewPayoutSeat = {
  wallet: string
  handle: string
  sharePct: number
  taskJobId: string
  claimId?: string
  deliveryVerified: boolean
  forfeitedSharePct: number
  accruedSol: number
  releasableSol: number
  releasedSol: number
}

export type CrewPayoutLedger = {
  mint: string
  ticker: string
  launchedAt: number
  promoWindowEndsAt: number
  seats: CrewPayoutSeat[]
  pooledForfeitSol: number
  updatedAt: number
}

const ledgers = new Map<string, CrewPayoutLedger>()

export function resetDeliveryPayoutLedgers(): void {
  ledgers.clear()
}

export function getCrewPayoutLedger(mint: string): CrewPayoutLedger | null {
  return ledgers.get(mint.trim()) || null
}

function promoAutoChecks(ticker: string, pageUrl: string, launchedAt: number): TaskAutoChecks {
  return {
    requireHttpsUrls: true,
    urlReachable: true,
    xPost: true,
    requiredTicker: ticker.replace(/^\$+/, ''),
    requiredLink: pageUrl,
    minUrls: 1,
    postedWithinHours: promoPostWindowHours(),
    stillLiveAfterHours: promoStillLiveAfterHours(),
    minEngagement: promoMinEngagement(),
    launchAtMs: launchedAt,
  }
}

export async function provisionDeliveryLedgerForLaunch(opts: {
  mint: string
  ticker: string
  crew: CrewMember[]
  createdBy: string
  launchedAt?: number
}): Promise<CrewPayoutLedger | null> {
  if (!deliveryGatedPayoutsEnabled()) return null
  const mint = opts.mint.trim()
  if (!mint || !opts.crew.length) return null

  const launchedAt = opts.launchedAt ?? nowMs()
  const pageUrl = coinPageUrl(mint)
  const windowH = promoPostWindowHours()
  const seats: CrewPayoutSeat[] = []

  for (const member of opts.crew) {
    const job = memoryJobs.createTask({
      createdBy: opts.createdBy,
      title: `Promo delivery — ${opts.ticker}`,
      spec:
        `Post on X mentioning $${opts.ticker.replace(/^\$+/, '')} with ${pageUrl}. ` +
        `Submit the status URL within ${windowH}h of launch. CrewPay sim/devnet escrow only.`,
      taskCategory: 'promo-delivery',
      type: 'community',
      chainId: 'solana-devnet',
      asset: 'SOL',
      budget: parseAmountToBigint(0.01),
      rewardPerSlot: parseAmountToBigint(0.01),
      slots: 1,
      slotsPerWorker: 1,
      deadline: launchedAt + windowH * 60 * 60_000,
      autoChecks: promoAutoChecks(opts.ticker, pageUrl, launchedAt),
      objectionWindowHours: 0,
    })
    job.mint = mint
    memoryJobs.setJob(job)

    seats.push({
      wallet: member.wallet,
      handle: member.handle,
      sharePct: member.share,
      taskJobId: job.id,
      deliveryVerified: false,
      forfeitedSharePct: 0,
      accruedSol: 0,
      releasableSol: 0,
      releasedSol: 0,
    })
  }

  const ledger: CrewPayoutLedger = {
    mint,
    ticker: opts.ticker,
    launchedAt,
    promoWindowEndsAt: launchedAt + windowH * 60 * 60_000,
    seats,
    pooledForfeitSol: 0,
    updatedAt: nowMs(),
  }
  ledgers.set(mint, ledger)
  return ledger
}

/** Credit simulated crew fee accrual (e.g. from remit observation). */
export function accrueCrewPayout(mint: string, wallet: string, amountSol: number): CrewPayoutLedger | null {
  const ledger = getCrewPayoutLedger(mint)
  if (!ledger) return null
  const w = wallet.trim()
  const seat = ledger.seats.find((s) => s.wallet === w)
  if (!seat) return ledger
  seat.accruedSol = round6(seat.accruedSol + Math.max(0, amountSol))
  ledger.updatedAt = nowMs()
  recomputeReleasable(ledger)
  return ledger
}

function round6(n: number): number {
  return Number(Number(n).toFixed(6))
}

function recomputeReleasable(ledger: CrewPayoutLedger): void {
  const verified = ledger.seats.filter((s) => s.deliveryVerified)
  const verifiedWeight = verified.reduce((sum, s) => sum + Math.max(0, s.sharePct), 0)
  const pool = ledger.pooledForfeitSol

  for (const seat of ledger.seats) {
    if (!seat.deliveryVerified) {
      seat.releasableSol = 0
      continue
    }
    const weight = verifiedWeight > 0 ? seat.sharePct / verifiedWeight : 0
    const bonus = pool * weight
    seat.releasableSol = round6(seat.accruedSol + bonus)
  }
}

export async function submitPromoDelivery(opts: {
  mint: string
  wallet: string
  urls: string[]
  text?: string
  kolHandle?: string
  reachability?: UrlReachabilityChecker
  submittedAt?: number
}): Promise<{ ok: boolean; ledger?: CrewPayoutLedger; checks?: unknown; error?: string }> {
  const ledger = getCrewPayoutLedger(opts.mint)
  if (!ledger) return { ok: false, error: 'No delivery ledger for mint' }
  const seat = ledger.seats.find((s) => s.wallet === opts.wallet.trim())
  if (!seat) return { ok: false, error: 'Wallet not in crew ledger' }

  const job = memoryJobs.getJob(seat.taskJobId)
  if (!job) return { ok: false, error: 'Promo task missing' }

  let claim = memoryJobs.findClaims(job.id).find((c) => c.kolWallet === opts.wallet.trim())
  if (!claim) {
    claim = memoryJobs.claimJob(job.id, opts.wallet.trim(), job.chainId, opts.kolHandle)
  }

  const sub = memoryJobs.submit(claim.id, { urls: opts.urls })
  const checks = await runTaskAutoChecks(
    job.rules.autoChecks,
    {
      urls: opts.urls,
      text: opts.text,
      kolHandle: opts.kolHandle,
      submittedAtMs: opts.submittedAt ?? nowMs(),
    },
    { reachability: opts.reachability },
  )
  sub.verification = checks
  if (checks.ok) {
    sub.verifiedAt = opts.submittedAt ?? nowMs()
    sub.autoReleaseEligibleAt = sub.verifiedAt
    seat.deliveryVerified = true
    claim.status = 'verified'
    const onTime = sub.verifiedAt <= job.deadline
    recordVerifiedJobCompletion({ wallet: opts.wallet, onTime })
  }
  memoryJobs.setSubmission(sub)
  memoryJobs.setClaim(claim)

  ledger.updatedAt = nowMs()
  recomputeReleasable(ledger)
  return { ok: Boolean(checks.ok), ledger, checks }
}

/** Forfeit unverified seats after promo window; roll share to verified crew. */
export function finalizeUnverifiedRollbacks(mint: string, now = nowMs()): CrewPayoutLedger | null {
  const ledger = getCrewPayoutLedger(mint)
  if (!ledger) return null
  if (now < ledger.promoWindowEndsAt) return ledger

  let forfeitedSol = 0
  let forfeitedShare = 0
  for (const seat of ledger.seats) {
    if (seat.deliveryVerified) continue
    forfeitedShare += seat.sharePct
    seat.forfeitedSharePct = seat.sharePct
    forfeitedSol += seat.accruedSol
    seat.accruedSol = 0
  }
  ledger.pooledForfeitSol = round6(ledger.pooledForfeitSol + forfeitedSol)
  ledger.updatedAt = now
  recomputeReleasable(ledger)
  return { ...ledger, forfeitedShare }
}

export async function releaseVerifiedCrewPayouts(
  mint: string,
  opts?: { from?: string },
): Promise<{ releases: Record<string, unknown>[]; ledger: CrewPayoutLedger | null }> {
  const ledger = getCrewPayoutLedger(mint)
  if (!ledger) return { releases: [], ledger: null }
  finalizeUnverifiedRollbacks(mint)
  const releases: Record<string, unknown>[] = []

  for (const seat of ledger.seats) {
    if (!seat.deliveryVerified || seat.releasableSol <= seat.releasedSol) continue
    const job = memoryJobs.getJob(seat.taskJobId)
    if (!job?.escrowRef) {
      // Mark releasable without rail when escrow not funded (accounting-only).
      const delta = seat.releasableSol - seat.releasedSol
      seat.releasedSol = seat.releasableSol
      releases.push({ wallet: seat.wallet, accountingOnly: true, amountSol: delta })
      continue
    }
    const auto = await processAutoReleases(job, opts)
    releases.push(...auto)
    if (auto.length) {
      seat.releasedSol = seat.releasableSol
    }
  }
  ledger.updatedAt = nowMs()
  return { releases, ledger }
}

export function ledgerPublicView(ledger: CrewPayoutLedger) {
  return {
    mint: ledger.mint,
    ticker: ledger.ticker,
    launchedAt: ledger.launchedAt,
    promoWindowEndsAt: ledger.promoWindowEndsAt,
    deliveryGated: true,
    pooledForfeitSol: ledger.pooledForfeitSol,
    seats: ledger.seats.map((s) => ({
      handle: s.handle,
      wallet: s.wallet,
      sharePct: s.sharePct,
      taskJobId: s.taskJobId,
      deliveryVerified: s.deliveryVerified,
      forfeitedSharePct: s.forfeitedSharePct,
      accruedSol: s.accruedSol,
      releasableSol: s.releasableSol,
      releasedSol: s.releasedSol,
    })),
    note:
      'Crew 60% still splits on-chain per launch shareholders. Delivery-gated release is sim/devnet escrow + accounting; unverified shares roll to verified crew after the promo window.',
  }
}
