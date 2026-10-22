import { jobsPlatformFeeBps, jobsPlatformFeeWallet } from './config.js'
import { fundingToJson, jobToJson, submissionToJson } from './serialize.js'
import { railFor } from './settlement.js'
import { memoryJobs } from './store.js'
import {
  formatAmountFromBigint,
  nowMs,
  type ChainId,
  type ContentKind,
  type Job,
  type JobReceipt,
  type Submission,
} from './types.js'

/** Test/devnet only — paid content jobs never target mainnet. */
export const CONTENT_JOB_CHAIN_IDS = ['solana-devnet', 'evm:base-sepolia', 'flop-testnet'] as const
export type ContentJobChainId = (typeof CONTENT_JOB_CHAIN_IDS)[number]

export const CONTENT_KINDS: ContentKind[] = ['thread', 'meme', 'post']

const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'])

export function isContentJobChainId(value: unknown): value is ContentJobChainId {
  return typeof value === 'string' && (CONTENT_JOB_CHAIN_IDS as readonly string[]).includes(value)
}

export function isContentKind(value: unknown): value is ContentKind {
  return typeof value === 'string' && (CONTENT_KINDS as readonly string[]).includes(value as ContentKind)
}

/** Accept only public X/Twitter status URLs (https). */
export function isXStatusUrl(raw: string): boolean {
  try {
    const u = new URL(String(raw || '').trim())
    if (u.protocol !== 'https:') return false
    if (!X_HOSTS.has(u.hostname.toLowerCase())) return false
    return /\/status\/\d+/.test(u.pathname)
  } catch {
    return false
  }
}

const TERMINAL: ReadonlySet<Job['status']> = new Set(['paid', 'refunded', 'expired', 'closed'])

export function contentJobIsOpen(job: Job, now = nowMs()): boolean {
  if (job.mode !== 'content') return false
  if (TERMINAL.has(job.status)) return false
  if (job.winnerSubmissionId) return false
  return job.deadline > now
}

export async function expireContentJobIfNeeded(
  job: Job,
  opts?: { from?: string; to?: string },
): Promise<{ job: Job; receipt: JobReceipt | null; unsigned?: unknown; txRef?: string }> {
  if (job.mode !== 'content') return { job, receipt: null }
  if (TERMINAL.has(job.status) || job.winnerSubmissionId) return { job, receipt: null }
  if (job.deadline > nowMs()) return { job, receipt: null }

  const from = (opts?.from || job.escrowFrom || '').trim() || undefined
  const to = (opts?.to || from || job.escrowFrom || '').trim()
  let unsigned: unknown
  let txRef: string | undefined
  if (job.escrowRef && to) {
    const rail = railFor(job.chainId, process.env.JOBS_RAIL)
    const out = await rail.refund(
      { chainId: job.chainId, asset: job.asset },
      { id: job.escrowRef, rail: rail.name },
      { to, from },
    )
    unsigned = out.unsigned
    txRef = out.txRef
  }
  job.status = 'expired'
  memoryJobs.setJob(job)
  const receipt = memoryJobs.addReceipt({
    kind: 'content-expired',
    jobId: job.id,
    title: job.title,
    contentKind: job.contentKind,
    amount: formatAmountFromBigint(job.budget),
    asset: job.asset,
    chainId: job.chainId,
    txRef,
    unsigned: Boolean(unsigned),
    status: 'expired',
  })
  return { job, receipt, unsigned, txRef }
}

export async function fundContentJob(
  jobId: string,
  opts: { rail?: string; from?: string },
): Promise<{ job: ReturnType<typeof jobToJson>; funding: unknown; unsigned?: unknown }> {
  const job = memoryJobs.getJob(jobId)
  if (!job || job.mode !== 'content') throw new Error('Content job not found')
  const railName = (opts.rail || process.env.JOBS_RAIL || 'sim').trim().toLowerCase()
  if (railName === 'solana' || railName.includes('mainnet')) {
    throw new Error('Content jobs are DEVNET only')
  }
  const rail = railFor(job.chainId, railName)
  const ctx = { chainId: job.chainId, asset: job.asset }
  const from = opts.from?.trim()
  const { escrow, unsigned } = await rail.fund(ctx, { amount: job.budget, from })
  await rail.lock(ctx, escrow)
  const vf = await rail.verifyFunding(ctx, escrow)
  // Rails key balances by escrow.id (ref is a display prefix like sim:…).
  job.escrowRef = escrow.id
  job.escrowFrom = from || null
  job.status = vf.ok ? 'funded' : 'created'
  memoryJobs.setJob(job)
  const funding = memoryJobs.addFunding(job.id, rail.name, job.budget, vf.ok, vf.detail)
  return { job: jobToJson(job), funding: fundingToJson(funding), unsigned }
}

export async function pickContentWinner(
  job: Job,
  submissionId: string,
  opts: { from?: string },
): Promise<{
  job: Job
  submission: Submission
  unsigned?: unknown
  txRef?: string
  receipt: JobReceipt
  requiresSignature: boolean
  kolAmount: number
  platformFee: { bps: number; wallet: string; amount: number } | null
}> {
  if (job.mode !== 'content') throw new Error('Not a content job')
  const expired = await expireContentJobIfNeeded(job, { from: opts.from })
  if (expired.receipt) throw new Error('Job expired — reward refunded to the agent')
  if (!job.escrowRef) throw new Error('Job not funded')
  if (TERMINAL.has(job.status)) throw new Error(`Job is ${job.status}`)
  const sub = memoryJobs.pickWinner(job.id, submissionId)
  const winnerWallet = (sub.wallet || '').trim()
  if (!winnerWallet) throw new Error('Winner submission has no wallet')

  const amount = job.budget
  const feeBps = jobsPlatformFeeBps()
  const feeWallet = jobsPlatformFeeWallet()
  const feeAmount = feeBps > 0 && feeWallet ? (amount * BigInt(feeBps)) / 10_000n : 0n
  const kolAmount = amount - feeAmount
  const from = (opts.from || job.escrowFrom || '').trim() || undefined
  const rail = railFor(job.chainId, process.env.JOBS_RAIL)
  const rel = await rail.release(
    { chainId: job.chainId, asset: job.asset },
    { id: job.escrowRef, rail: rail.name },
    { to: winnerWallet, amount: kolAmount, from },
  )
  const requiresSignature = Boolean(rel.unsigned)
  if (!requiresSignature) {
    job.status = 'paid'
    memoryJobs.setJob(job)
  }
  const receipt = memoryJobs.addReceipt({
    kind: 'content-payout',
    jobId: job.id,
    title: job.title,
    contentKind: job.contentKind,
    winnerWallet,
    xUrl: sub.urls[0],
    amount: formatAmountFromBigint(kolAmount),
    asset: job.asset,
    chainId: job.chainId,
    txRef: rel.txRef,
    unsigned: requiresSignature,
    status: requiresSignature ? 'pending-signature' : 'released',
  })
  return {
    job: memoryJobs.getJob(job.id) || job,
    submission: sub,
    unsigned: rel.unsigned,
    txRef: rel.txRef,
    receipt,
    requiresSignature,
    kolAmount: formatAmountFromBigint(kolAmount),
    platformFee:
      feeAmount > 0n && feeWallet
        ? { bps: feeBps, wallet: feeWallet, amount: formatAmountFromBigint(feeAmount) }
        : null,
  }
}

export async function rejectContentJob(
  job: Job,
  opts: { from?: string; to?: string },
): Promise<{ job: Job; receipt: JobReceipt; unsigned?: unknown; txRef?: string }> {
  if (job.mode !== 'content') throw new Error('Not a content job')
  if (job.winnerSubmissionId) throw new Error('Winner already picked — cannot reject')
  if (TERMINAL.has(job.status)) throw new Error(`Job is ${job.status}`)
  if (!job.escrowRef) throw new Error('Job not funded')
  const from = (opts.from || job.escrowFrom || '').trim() || undefined
  const to = (opts.to || from || job.escrowFrom || '').trim()
  if (!to) throw new Error('Provide refund address in body.to (or from)')
  const rail = railFor(job.chainId, process.env.JOBS_RAIL)
  const out = await rail.refund(
    { chainId: job.chainId, asset: job.asset },
    { id: job.escrowRef, rail: rail.name },
    { to, from },
  )
  job.status = 'refunded'
  memoryJobs.setJob(job)
  const receipt = memoryJobs.addReceipt({
    kind: 'content-refund',
    jobId: job.id,
    title: job.title,
    contentKind: job.contentKind,
    amount: formatAmountFromBigint(job.budget),
    asset: job.asset,
    chainId: job.chainId,
    txRef: out.txRef,
    unsigned: Boolean(out.unsigned),
    status: 'refunded',
  })
  return { job, receipt, unsigned: out.unsigned, txRef: out.txRef }
}

export function contentJobDetailJson(job: Job) {
  return {
    ...jobToJson(job),
    contentKind: job.contentKind || null,
    winnerSubmissionId: job.winnerSubmissionId || null,
    submissions: memoryJobs.listSubmissionsForJob(job.id).map(submissionToJson),
    open: contentJobIsOpen(job),
  }
}

export function receiptToJson(r: JobReceipt) {
  return {
    id: r.id,
    kind: r.kind,
    jobId: r.jobId,
    title: r.title || null,
    contentKind: r.contentKind || null,
    winnerWallet: r.winnerWallet || null,
    xUrl: r.xUrl || null,
    amount: r.amount,
    asset: r.asset,
    chainId: r.chainId,
    txRef: r.txRef || null,
    unsigned: Boolean(r.unsigned),
    at: r.at,
    status: r.status,
    proofUrl: '/proof',
    jobUrl: `/jobs/${r.jobId}`,
  }
}
