import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { memoryJobs } from './store.js'
import { simSettlementRail } from './settlement.js'
import { parseAmountToBigint } from './types.js'
import { runAutoChecksOnSubmission, processAutoReleases, slotsRemaining } from './tasks-flow.js'

describe('generic tasks lifecycle', () => {
  beforeEach(() => {
    memoryJobs.clearAll()
    process.env.TASKS_REQUIRE_REGISTERED_KOL = 'false'
    process.env.JOBS_RAIL = 'sim'
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('create → fund → claim → submit with auto-checks → auto-release after objection window', async () => {
    const budget = parseAmountToBigint(5)
    const reward = parseAmountToBigint(1)
    const job = memoryJobs.createTask({
      createdBy: 'agent',
      title: 'Label 500 images',
      spec: 'Tag each image with fruit names. Return a CSV link.',
      taskCategory: 'labeling',
      chainId: 'solana-devnet',
      asset: 'USDC',
      budget,
      rewardPerSlot: reward,
      slots: 3,
      slotsPerWorker: 1,
      deadline: Date.now() + 86400_000,
      autoChecks: { keyword: 'csv', minTextLength: 4 },
      objectionWindowHours: 1,
    })
    expect(slotsRemaining(job)).toBe(3)

    const rail = simSettlementRail()
    const { escrow } = await rail.fund({ chainId: job.chainId, asset: job.asset }, { amount: job.budget })
    job.escrowRef = escrow.id
    job.status = 'funded'
    memoryJobs.setJob(job)

    const claim = memoryJobs.claimJob(job.id, 'WorkerWallet1111111111111111111111111111', job.chainId)
    let sub = memoryJobs.submit(claim.id, {
      text: 'Done — csv at https://example.com/out.csv',
      urls: ['https://example.com/out.csv'],
    })
    sub = await runAutoChecksOnSubmission(job, sub, claim.kolHandle)
    memoryJobs.setSubmission(sub)
    expect(sub.verification?.ok).toBe(true)
    expect(sub.autoReleaseEligibleAt).toBeTruthy()

    vi.setSystemTime((sub.autoReleaseEligibleAt || 0) + 1)
    const releases = await processAutoReleases(job)
    expect(releases.length).toBe(1)
    expect(releases[0].autoReleased).toBe(true)
  })

  it('agent objection blocks auto-release', async () => {
    const job = memoryJobs.createTask({
      createdBy: 'agent',
      title: 'QA app',
      spec: 'Run smoke tests and file issues.',
      chainId: 'solana-devnet',
      asset: 'SOL',
      budget: parseAmountToBigint(2),
      rewardPerSlot: parseAmountToBigint(1),
      slots: 1,
      slotsPerWorker: 1,
      deadline: Date.now() + 86400_000,
      autoChecks: { keyword: 'pass' },
      objectionWindowHours: 0,
    })
    job.escrowRef = 'escrow'
    job.status = 'funded'
    memoryJobs.setJob(job)
    const claim = memoryJobs.claimJob(job.id, 'W', job.chainId)
    let sub = memoryJobs.submit(claim.id, { text: 'all pass' })
    sub = await runAutoChecksOnSubmission(job, sub)
    memoryJobs.setSubmission(sub)
    memoryJobs.objectToAutoRelease(claim.id)
    vi.setSystemTime(Date.now() + 60_000)
    const releases = await processAutoReleases(job)
    expect(releases.length).toBe(0)
  })

  it('dispute freezes job', () => {
    const job = memoryJobs.createTask({
      createdBy: 'a',
      title: 'Research',
      spec: 'Summarize competitors.',
      chainId: 'solana-devnet',
      asset: 'SOL',
      budget: parseAmountToBigint(1),
      rewardPerSlot: parseAmountToBigint(1),
      slots: 1,
      slotsPerWorker: 1,
      deadline: Date.now() + 86400_000,
    })
    const d = memoryJobs.openDispute({ jobId: job.id, openedBy: 'worker', reason: 'Scope changed mid-task' })
    expect(d.status).toBe('open')
    expect(memoryJobs.getJob(job.id)?.status).toBe('disputed')
  })
})
