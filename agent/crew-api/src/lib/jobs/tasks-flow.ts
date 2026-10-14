import { jobsPlatformFeeBps, jobsPlatformFeeWallet } from './config.js'
import { railFor } from './settlement.js'
import { memoryJobs } from './store.js'
import { runTaskAutoChecks } from './task-checks.js'
import {
  clampBigint,
  formatAmountFromBigint,
  nowMs,
  type Job,
  type Submission,
} from './types.js'

export function objectionWindowMs(job: Job): number {
  const h = job.rules.objectionWindowHours ?? 24
  return Math.max(0, Math.min(168, h)) * 60 * 60_000
}

export async function runAutoChecksOnSubmission(job: Job, sub: Submission, kolHandle?: string) {
  if (job.mode !== 'task') return sub
  const vi = await runTaskAutoChecks(job.rules.autoChecks, {
    urls: sub.urls,
    text: sub.text,
    files: sub.files,
    kolHandle,
  })
  sub.verification = vi
  if (vi.ok) {
    sub.autoReleaseEligibleAt = nowMs() + objectionWindowMs(job)
  }
  return sub
}

export function countFilledSlots(jobId: string): number {
  return memoryJobs.findClaims(jobId).filter((c) => c.status !== 'rejected').length
}

export function slotsRemaining(job: Job): number {
  return Math.max(0, job.maxProofs - countFilledSlots(job.id))
}

/** Process submissions past objection window — returns payout payloads (unsigned on devnet). */
export async function processAutoReleases(job: Job, opts?: { from?: string }) {
  if (job.mode !== 'task' || !job.escrowRef) return []
  if (job.status === 'disputed' || job.status === 'frozen') return []
  const now = nowMs()
  const out: Record<string, unknown>[] = []
  const rail = railFor(job.chainId, process.env.JOBS_RAIL)
  const ctx = { chainId: job.chainId, asset: job.asset }
  const feeBps = jobsPlatformFeeBps()
  const feeWallet = jobsPlatformFeeWallet()

  for (const claim of memoryJobs.findClaims(job.id)) {
    const subs = memoryJobs.listSubmissionsForClaim(claim.id).sort((a, b) => b.createdAt - a.createdAt)
    const sub = subs[0]
    if (!sub || !sub.verification?.ok) continue
    if (sub.agentObjected) continue
    if (!sub.autoReleaseEligibleAt || sub.autoReleaseEligibleAt > now) continue
    if (claim.status === 'paid') continue

    const amount = clampBigint(job.perProofAmount, 0n, job.budget)
    const feeAmount = feeBps > 0 && feeWallet ? (amount * BigInt(feeBps)) / 10_000n : 0n
    const kolAmount = amount - feeAmount
    const from = opts?.from || job.escrowFrom || undefined
    const rel = await rail.release(ctx, { id: job.escrowRef, rail: rail.name }, {
      to: claim.kolWallet,
      amount: kolAmount,
      from,
    })
    claim.status = 'paid'
    memoryJobs.setClaim(claim)
    sub.paidAmount = kolAmount
    sub.verifiedAt = sub.verifiedAt || now
    memoryJobs.setSubmission(sub)
    job.budget = job.budget - amount
    out.push({
      claimId: claim.id,
      submissionId: sub.id,
      autoReleased: true,
      kolAmount: formatAmountFromBigint(kolAmount),
      platformFee:
        feeAmount > 0n
          ? { bps: feeBps, wallet: feeWallet, amount: formatAmountFromBigint(feeAmount) }
          : null,
      unsigned: rel.unsigned,
      txRef: rel.txRef,
    })
  }
  if (out.length) memoryJobs.setJob(job)
  return out
}
