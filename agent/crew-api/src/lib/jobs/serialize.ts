import { formatAmountFromBigint, type FundingRecord, type Job, type Submission } from './types.js'

/** JSON-safe job (bigint amounts → display numbers). */
export function jobToJson(job: Job) {
  return {
    id: job.id,
    type: job.type,
    mode: job.mode || 'campaign',
    title: job.title,
    spec: job.spec,
    taskCategory: job.taskCategory,
    contentKind: job.contentKind,
    winnerSubmissionId: job.winnerSubmissionId ?? null,
    createdBy: job.createdBy,
    chainId: job.chainId,
    asset: job.asset,
    budget: formatAmountFromBigint(job.budget),
    perProofAmount: formatAmountFromBigint(job.perProofAmount),
    rewardPerSlot: formatAmountFromBigint(job.perProofAmount),
    reward: formatAmountFromBigint(job.budget),
    maxProofs: job.maxProofs,
    slots: job.maxProofs,
    perKOLCap: job.perKOLCap,
    slotsPerWorker: job.perKOLCap,
    deadline: job.deadline,
    rules: job.rules,
    status: job.status,
    escrowRef: job.escrowRef ?? null,
    escrowFrom: job.escrowFrom ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    mint: job.mint,
    templateId: job.templateId,
  }
}

export function fundingToJson(rec: FundingRecord) {
  return {
    id: rec.id,
    jobId: rec.jobId,
    rail: rec.rail,
    amount: formatAmountFromBigint(rec.amount),
    createdAt: rec.createdAt,
    verified: rec.verified,
    verifyDetail: rec.verifyDetail,
  }
}

export function submissionToJson(sub: Submission) {
  return {
    id: sub.id,
    jobId: sub.jobId,
    claimId: sub.claimId || null,
    wallet: sub.wallet || null,
    handle: sub.handle || null,
    urls: sub.urls,
    xUrl: sub.urls[0] || null,
    note: sub.text || null,
    text: sub.text,
    files: sub.files,
    createdAt: sub.createdAt,
    verifiedAt: sub.verifiedAt || null,
    verification: sub.verification || null,
    winner: Boolean(sub.winner),
  }
}
