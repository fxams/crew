import { formatAmountFromBigint, type Job } from './types.js'

/** JSON-safe job (bigint amounts → display numbers). */
export function jobToJson(job: Job) {
  return {
    id: job.id,
    type: job.type,
    mode: job.mode || 'campaign',
    title: job.title,
    spec: job.spec,
    taskCategory: job.taskCategory,
    createdBy: job.createdBy,
    chainId: job.chainId,
    asset: job.asset,
    budget: formatAmountFromBigint(job.budget),
    perProofAmount: formatAmountFromBigint(job.perProofAmount),
    rewardPerSlot: formatAmountFromBigint(job.perProofAmount),
    maxProofs: job.maxProofs,
    slots: job.maxProofs,
    perKOLCap: job.perKOLCap,
    slotsPerWorker: job.perKOLCap,
    deadline: job.deadline,
    rules: job.rules,
    status: job.status,
    escrowRef: job.escrowRef ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    mint: job.mint,
    templateId: job.templateId,
  }
}
