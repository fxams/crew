import { describe, it, expect, beforeEach } from 'vitest'
import { memoryJobs } from './jobs/store.js'
import { SimulatedSettlementRail } from './jobs/settlement.js'
import { defaultVerifier } from './jobs/verifier.js'
import { parseAmountToBigint } from './jobs/types.js'

describe('jobs + escrow (sim rail)', () => {
  beforeEach(() => {
    memoryJobs.clearAll()
  })

  it('lifecycle: create → fund → claim → submit → verify → payout → refund', async () => {
    // Agent creates a campaign (test budget = 10 units; per = 2 units)
    const budget = parseAmountToBigint(10)
    const per = parseAmountToBigint(2)
    const job = memoryJobs.createCampaign({
      createdBy: 'crew_ak_test',
      chainId: 'solana-devnet',
      asset: 'SOL',
      budget,
      perProofAmount: per,
      maxProofs: 10,
      perKOLCap: 5,
      deadline: Date.now() + 6 * 60 * 60_000,
      rules: { requiredTicker: 'HOOT', requiredLink: 'https://pump.fun', platform: 'x' },
    })
    expect(job.status).toBe('created')

    // Fund escrow (sim rail), lock, verify
    const rail = new SimulatedSettlementRail()
    const { escrow } = await rail.fund({ chainId: job.chainId, asset: job.asset }, { amount: job.budget })
    await rail.lock({ chainId: job.chainId, asset: job.asset }, escrow)
    const vf = await rail.verifyFunding({ chainId: job.chainId, asset: job.asset }, escrow)
    expect(vf.ok).toBe(true)
    job.escrowRef = escrow.id
    job.status = 'funded'
    memoryJobs.setJob(job)

    // KOL claims and submits a matching X post
    const claim = memoryJobs.claimJob(job.id, '4j4nFvh7cDg4fUD7E2w8aQ5u6fPhantomFakeWallet', job.chainId, 'owl')
    const submit = memoryJobs.submit(claim.id, {
      urls: [
        'https://x.com/owl/status/1?ticker=hoot&link=https://pump.fun',
        'https://twitter.com/owl/status/2?blah',
      ],
    })
    expect(submit.urls.length).toBeGreaterThan(0)

    // Verify proof (mock verifier accepts URL containing ticker and link on x/twitter host)
    const v = await defaultVerifier().verify({
      platform: 'x',
      kolHandle: 'owl',
      urls: submit.urls,
      requiredTicker: 'HOOT',
      requiredLink: 'https://pump.fun',
      minPostAgeHours: 0,
    })
    expect(v.ok).toBe(true)
    const accepted = v.acceptedUrls || []
    expect(accepted.length).toBeGreaterThan(0)

    // Payout: number of proofs is min(accepted, caps, budget/per)
    const verifiedCount = accepted.length
    const maxByBudget = Number(job.budget / job.perProofAmount)
    const maxAllowed = Math.min(job.maxProofs, job.perKOLCap, maxByBudget)
    const proofsToPay = Math.min(verifiedCount, maxAllowed)
    const amount = job.perProofAmount * BigInt(proofsToPay)
    const rel = await rail.release(
      { chainId: job.chainId, asset: job.asset },
      { id: job.escrowRef!, rail: 'sim' },
      { to: claim.kolWallet, amount },
    )
    expect(rel.txRef).toMatch(/sim-release:/)
    job.budget = job.budget - amount
    memoryJobs.setJob(job)
    expect(Number(job.budget)).toBeGreaterThanOrEqual(0)

    // Refund leftover
    const refund = await rail.refund(
      { chainId: job.chainId, asset: job.asset },
      { id: job.escrowRef!, rail: 'sim' },
      { to: 'RefundWallet' },
    )
    expect(refund.txRef).toMatch(/sim-refund:/)
  })

  it('enforces caps: perKOLCap and maxProofs', async () => {
    const budget = parseAmountToBigint(10) // 10
    const per = parseAmountToBigint(1) // 1
    const job = memoryJobs.createCampaign({
      createdBy: 'crew_ak_test',
      chainId: 'solana-devnet',
      asset: 'SOL',
      budget,
      perProofAmount: per,
      maxProofs: 3,
      perKOLCap: 2,
      deadline: Date.now() + 6 * 60 * 60_000,
      rules: { requiredTicker: 'AAA', platform: 'x' },
    })
    const rail = new SimulatedSettlementRail()
    const { escrow } = await rail.fund({ chainId: job.chainId, asset: job.asset }, { amount: job.budget })
    job.escrowRef = escrow.id
    memoryJobs.setJob(job)
    const claim = memoryJobs.claimJob(job.id, 'Wallet', job.chainId, 'a')
    const submit = memoryJobs.submit(claim.id, {
      urls: [
        'https://x.com/a/status/1?ticker=aaa',
        'https://x.com/a/status/2?ticker=aaa',
        'https://x.com/a/status/3?ticker=aaa',
      ],
    })
    const v = await defaultVerifier().verify({
      platform: 'x',
      kolHandle: 'a',
      urls: submit.urls,
      requiredTicker: 'AAA',
    })
    expect(v.ok).toBe(true)
    const accepted = v.acceptedUrls || []
    expect(accepted.length).toBe(3)
    const maxByBudget = Number(job.budget / job.perProofAmount) // 10
    const maxAllowed = Math.min(job.maxProofs, job.perKOLCap, maxByBudget) // min(3,2,10) = 2
    expect(maxAllowed).toBe(2)
  })

  it('rejects when no acceptable URLs', async () => {
    const v = await defaultVerifier().verify({
      platform: 'x',
      urls: ['https://example.com/not-x', 'https://x.com/nope?ticker=missing'],
      requiredTicker: 'ZZZ',
    })
    expect(v.ok).toBe(false)
  })
})

