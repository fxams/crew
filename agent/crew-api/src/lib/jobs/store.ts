import { randomBytes } from 'node:crypto'
import {
  type AssetSymbol,
  type CampaignJob,
  type FundingRecord,
  type Job,
  type JobClaim,
  type Submission,
  type ChainId,
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
}

export class InMemoryJobStore {
  private jobs = new Map<string, Job>()
  private claims = new Map<string, JobClaim>()
  private submissions = new Map<string, Submission>()
  private fundings = new Map<string, FundingRecord>()

  clearAll(): void {
    this.jobs.clear()
    this.claims.clear()
    this.submissions.clear()
    this.fundings.clear()
  }

  createCampaign(input: CreateCampaignInput): CampaignJob {
    const id = genId('job')
    const now = nowMs()
    const job: CampaignJob = {
      id,
      type: 'campaign',
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
      createdAt: now,
      updatedAt: now,
    }
    this.jobs.set(id, job)
    return job
  }

  listOpen(): Job[] {
    const now = nowMs()
    const out: Job[] = []
    for (const j of this.jobs.values()) {
      if (j.deadline <= now) continue
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

  submit(claimId: string, urls: string[]): Submission {
    const id = genId('sub')
    const sub: Submission = {
      id,
      claimId,
      urls: Array.from(new Set(urls.map((u) => String(u || '').trim()).filter(Boolean))),
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

  listSubmissionsForClaim(claimId: string): Submission[] {
    return [...this.submissions.values()].filter((s) => s.claimId === claimId)
  }
}

// Singleton for dev/test usage
export const memoryJobs = new InMemoryJobStore()

