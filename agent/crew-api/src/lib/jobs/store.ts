import { randomBytes } from 'node:crypto'
import {
  type AssetSymbol,
  type CampaignJob,
  type FundingRecord,
  type Job,
  type JobClaim,
  type JobDispute,
  type Submission,
  type SubmissionProofFile,
  type ChainId,
  type TaskAutoChecks,
  nowMs,
} from './types.js'

function genId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`
}

export type CreateCampaignInput = {
  createdBy: string
  chainId: ChainId
  asset: AssetSymbol
  budget: bigint
  perProofAmount: bigint
  maxProofs: number
  perKOLCap: number
  deadline: number
  rules: CampaignJob['rules']
  type?: CampaignJob['type']
  mint?: string
  templateId?: string
}

export type CreateTaskInput = {
  createdBy: string
  title: string
  spec: string
  taskCategory?: string
  type?: CampaignJob['type']
  chainId: ChainId
  asset: AssetSymbol
  budget: bigint
  rewardPerSlot: bigint
  slots: number
  slotsPerWorker: number
  deadline: number
  autoChecks?: TaskAutoChecks
  objectionWindowHours?: number
}

export class InMemoryJobStore {
  private jobs = new Map<string, Job>()
  private claims = new Map<string, JobClaim>()
  private submissions = new Map<string, Submission>()
  private fundings = new Map<string, FundingRecord>()
  private disputes = new Map<string, JobDispute>()

  clearAll(): void {
    this.jobs.clear()
    this.claims.clear()
    this.submissions.clear()
    this.fundings.clear()
    this.disputes.clear()
  }

  createCampaign(input: CreateCampaignInput): CampaignJob {
    const id = genId('job')
    const now = nowMs()
    const job: CampaignJob = {
      id,
      type: input.type || 'campaign',
      mode: 'campaign',
      createdBy: input.createdBy,
      chainId: input.chainId,
      asset: input.asset,
      budget: input.budget,
      perProofAmount: input.perProofAmount,
      maxProofs: input.maxProofs,
      perKOLCap: input.perKOLCap,
      deadline: input.deadline,
      rules: input.rules || { platform: 'x' },
      status: 'created',
      escrowRef: null,
      escrowFrom: null,
      createdAt: now,
      updatedAt: now,
      mint: input.mint,
      templateId: input.templateId,
    }
    this.jobs.set(id, job)
    return job
  }

  createTask(input: CreateTaskInput): CampaignJob {
    const id = genId('job')
    const now = nowMs()
    const rules = {
      platform: 'any' as const,
      objectionWindowHours: input.objectionWindowHours ?? 24,
      autoChecks: input.autoChecks || {},
    }
    const job: CampaignJob = {
      id,
      type: input.type || 'task',
      mode: 'task',
      title: input.title.trim(),
      spec: input.spec.trim(),
      taskCategory: input.taskCategory?.trim() || undefined,
      createdBy: input.createdBy,
      chainId: input.chainId,
      asset: input.asset,
      budget: input.budget,
      perProofAmount: input.rewardPerSlot,
      maxProofs: input.slots,
      perKOLCap: input.slotsPerWorker,
      deadline: input.deadline,
      rules,
      status: 'created',
      escrowRef: null,
      escrowFrom: null,
      createdAt: now,
      updatedAt: now,
    }
    this.jobs.set(id, job)
    return job
  }

  listTasks(opts?: { status?: string; category?: string }): Job[] {
    const cat = (opts?.category || '').trim().toLowerCase()
    const out: Job[] = []
    for (const j of this.jobs.values()) {
      if (j.mode !== 'task') continue
      if (cat && (j.taskCategory || '').toLowerCase() !== cat) continue
      if (opts?.status && j.status !== opts.status) continue
      out.push(j)
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  }

  listOpen(mint?: string): Job[] {
    const now = nowMs()
    const out: Job[] = []
    const want = (mint || '').trim()
    for (const j of this.jobs.values()) {
      if (j.deadline <= now) continue
      if (want && j.mint !== want) continue
      if (j.status === 'funded' || j.status === 'open' || j.status === 'assigned' || j.status === 'submitted') {
        out.push(j)
      }
    }
    return out.sort((a, b) => a.createdAt - b.createdAt)
  }

  getJob(id: string): Job | null {
    return this.jobs.get(id) || null
  }

  setJob(j: Job): void {
    j.updatedAt = nowMs()
    this.jobs.set(j.id, j)
  }

  addFunding(jobId: string, rail: string, amount: bigint, verified: boolean, verifyDetail?: string) {
    const id = genId('fund')
    const rec: FundingRecord = { id, jobId, rail, amount, createdAt: nowMs(), verified, verifyDetail }
    this.fundings.set(id, rec)
    const j = this.getJob(jobId)
    if (j) {
      j.status = 'funded'
      this.setJob(j)
    }
    return rec
  }

  claimJob(jobId: string, kolWallet: string, kolChainId: ChainId, kolHandle?: string): JobClaim {
    const job = this.getJob(jobId)
    if (job?.mode === 'task') {
      const active = [...this.claims.values()].filter((c) => c.jobId === jobId && c.status !== 'rejected')
      if (active.length >= job.maxProofs) {
        throw new Error('No task slots remaining')
      }
      const workerClaims = active.filter((c) => c.kolWallet === kolWallet)
      if (workerClaims.length >= job.perKOLCap) {
        throw new Error('Worker already at max slots for this task')
      }
    }
    const id = genId('claim')
    const claim: JobClaim = {
      id,
      jobId,
      kolHandle,
      kolWallet,
      kolChainId,
      status: 'claimed',
      createdAt: nowMs(),
      updatedAt: nowMs(),
    }
    this.claims.set(id, claim)
    const j = this.getJob(jobId)
    if (j && (j.status === 'funded' || j.status === 'open')) {
      j.status = 'assigned'
      this.setJob(j)
    }
    return claim
  }

  submit(
    claimId: string,
    proof: { urls?: string[]; text?: string; files?: SubmissionProofFile[] },
  ): Submission {
    const id = genId('sub')
    const urls = Array.from(new Set((proof.urls || []).map((u) => String(u || '').trim()).filter(Boolean)))
    const sub: Submission = {
      id,
      claimId,
      urls,
      text: proof.text?.trim() || undefined,
      files: proof.files?.length ? proof.files : undefined,
      createdAt: nowMs(),
    }
    this.submissions.set(id, sub)
    const claim = this.claims.get(claimId)
    if (claim) {
      claim.status = 'submitted'
      claim.updatedAt = nowMs()
      this.claims.set(claimId, claim)
    }
    const job = claim ? this.getJob(claim.jobId) : null
    if (job && (job.status === 'assigned' || job.status === 'funded')) {
      job.status = 'submitted'
      this.setJob(job)
    }
    return sub
  }

  findClaims(jobId: string): JobClaim[] {
    return [...this.claims.values()].filter((c) => c.jobId === jobId)
  }

  setClaim(claim: JobClaim): void {
    claim.updatedAt = nowMs()
    this.claims.set(claim.id, claim)
  }

  listSubmissionsForClaim(claimId: string): Submission[] {
    return [...this.submissions.values()].filter((s) => s.claimId === claimId)
  }

  openDispute(input: {
    jobId: string
    claimId?: string
    openedBy: 'agent' | 'worker'
    reason: string
  }): JobDispute {
    const job = this.getJob(input.jobId)
    if (!job) throw new Error('Job not found')
    const open = [...this.disputes.values()].find((d) => d.jobId === input.jobId && d.status === 'open')
    if (open) throw new Error('Dispute already open for this job')
    const id = genId('dispute')
    const rec: JobDispute = {
      id,
      jobId: input.jobId,
      claimId: input.claimId,
      openedBy: input.openedBy,
      reason: input.reason.trim(),
      status: 'open',
      createdAt: nowMs(),
    }
    this.disputes.set(id, rec)
    job.status = 'disputed'
    this.setJob(job)
    return rec
  }

  getOpenDispute(jobId: string): JobDispute | null {
    return [...this.disputes.values()].find((d) => d.jobId === jobId && d.status === 'open') || null
  }

  resolveDispute(
    disputeId: string,
    resolution: 'release' | 'refund',
    resolvedByWallet: string,
  ): JobDispute {
    const d = this.disputes.get(disputeId)
    if (!d || d.status !== 'open') throw new Error('Dispute not found or already resolved')
    d.status = 'resolved'
    d.resolution = resolution
    d.resolvedAt = nowMs()
    d.resolvedByWallet = resolvedByWallet
    this.disputes.set(disputeId, d)
    const job = this.getJob(d.jobId)
    if (job) {
      job.status = resolution === 'refund' ? 'refunded' : 'verified'
      this.setJob(job)
    }
    return d
  }

  setSubmission(sub: Submission): void {
    this.submissions.set(sub.id, sub)
  }

  objectToAutoRelease(claimId: string): void {
    const subs = this.listSubmissionsForClaim(claimId)
    const sub = subs.sort((a, b) => b.createdAt - a.createdAt)[0]
    if (sub) {
      sub.agentObjected = true
      this.submissions.set(sub.id, sub)
    }
  }
}

// Singleton for dev/test usage
export const memoryJobs = new InMemoryJobStore()

