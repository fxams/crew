import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { memoryJobs } from './store.js'
import { simSettlementRail } from './settlement.js'
import { parseAmountToBigint } from './types.js'
import {
  expireContentJobIfNeeded,
  isContentJobChainId,
  isXStatusUrl,
  pickContentWinner,
  rejectContentJob,
} from './content.js'

describe('paid content jobs (contest, not first-to-claim)', () => {
  beforeEach(() => {
    memoryJobs.clearAll()
    process.env.JOBS_RAIL = 'sim'
    process.env.JOBS_ENABLED = 'true'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects mainnet chain ids', () => {
    expect(isContentJobChainId('solana-devnet')).toBe(true)
    expect(isContentJobChainId('evm:base-sepolia')).toBe(true)
    expect(isContentJobChainId('flop-testnet')).toBe(true)
    expect(isContentJobChainId('solana')).toBe(false)
    expect(isContentJobChainId('evm:base')).toBe(false)
    expect(isContentJobChainId('evm:ethereum')).toBe(false)
  })

  it('accepts public X status URLs only', () => {
    expect(isXStatusUrl('https://x.com/owl/status/123')).toBe(true)
    expect(isXStatusUrl('https://twitter.com/owl/status/123')).toBe(true)
    expect(isXStatusUrl('http://x.com/owl/status/123')).toBe(false)
    expect(isXStatusUrl('https://x.com/owl')).toBe(false)
    expect(isXStatusUrl('https://example.com/status/123')).toBe(false)
  })

  it('create → fund → multiple submissions → agent picks second winner', async () => {
    const reward = parseAmountToBigint(1.5)
    const job = memoryJobs.createContentJob({
      createdBy: 'agent',
      title: 'Thread about the desk',
      spec: 'Write a 6-post thread. Tag @CrewPayHQ.',
      contentKind: 'thread',
      chainId: 'solana-devnet',
      asset: 'SOL',
      reward,
      deadline: Date.now() + 86_400_000,
    })
    expect(job.mode).toBe('content')
    expect(job.maxProofs).toBe(1)

    const rail = simSettlementRail()
    const { escrow } = await rail.fund({ chainId: job.chainId, asset: job.asset }, { amount: job.budget })
    job.escrowRef = escrow.id
    job.status = 'funded'
    memoryJobs.setJob(job)

    const first = memoryJobs.submitContentProof(job.id, {
      wallet: 'WalletA111111111111111111111111111111111',
      xUrl: 'https://x.com/a/status/1',
      note: 'first in',
    })
    const second = memoryJobs.submitContentProof(job.id, {
      wallet: 'WalletB111111111111111111111111111111111',
      xUrl: 'https://x.com/b/status/2',
      note: 'better thread',
    })
    expect(memoryJobs.listSubmissionsForJob(job.id)).toHaveLength(2)
    expect(first.id).not.toBe(second.id)

    const picked = await pickContentWinner(job, second.id, {})
    expect(picked.submission.id).toBe(second.id)
    expect(picked.submission.winner).toBe(true)
    expect(picked.kolAmount).toBe(1.5)
    expect(picked.txRef).toMatch(/sim-release:/)
    expect(memoryJobs.getJob(job.id)?.status).toBe('paid')
    expect(memoryJobs.getJob(job.id)?.winnerSubmissionId).toBe(second.id)
    const receipts = memoryJobs.listReceipts()
    expect(receipts[0]?.kind).toBe('content-payout')
    expect(receipts[0]?.winnerWallet).toBe('WalletB111111111111111111111111111111111')
    expect(receipts[0]?.xUrl).toBe('https://x.com/b/status/2')
  })

  it('does not pay the first submission by default', async () => {
    const job = memoryJobs.createContentJob({
      createdBy: 'agent',
      title: 'Meme',
      spec: 'One original meme.',
      contentKind: 'meme',
      chainId: 'solana-devnet',
      asset: 'SOL',
      reward: parseAmountToBigint(1),
      deadline: Date.now() + 86_400_000,
    })
    const rail = simSettlementRail()
    const { escrow } = await rail.fund({ chainId: job.chainId, asset: job.asset }, { amount: job.budget })
    job.escrowRef = escrow.id
    job.status = 'funded'
    memoryJobs.setJob(job)
    memoryJobs.submitContentProof(job.id, {
      wallet: 'First',
      xUrl: 'https://x.com/first/status/1',
    })
    const later = memoryJobs.submitContentProof(job.id, {
      wallet: 'Later',
      xUrl: 'https://x.com/later/status/2',
    })
    await pickContentWinner(job, later.id, {})
    expect(memoryJobs.listSubmissionsForJob(job.id).find((s) => s.wallet === 'First')?.winner).toBeFalsy()
    expect(memoryJobs.getJob(job.id)?.winnerSubmissionId).toBe(later.id)
  })

  it('reject with no pick refunds the agent', async () => {
    const job = memoryJobs.createContentJob({
      createdBy: 'agent',
      title: 'Post',
      spec: 'Quote tweet the launch.',
      contentKind: 'post',
      chainId: 'solana-devnet',
      asset: 'SOL',
      reward: parseAmountToBigint(2),
      deadline: Date.now() + 86_400_000,
    })
    const rail = simSettlementRail()
    const { escrow } = await rail.fund({ chainId: job.chainId, asset: job.asset }, { amount: job.budget })
    job.escrowRef = escrow.id
    job.status = 'funded'
    memoryJobs.setJob(job)
    memoryJobs.submitContentProof(job.id, {
      wallet: 'Human',
      xUrl: 'https://x.com/h/status/9',
      note: 'try',
    })
    const out = await rejectContentJob(job, { to: 'AgentWallet' })
    expect(out.job.status).toBe('refunded')
    expect(out.txRef).toMatch(/sim-refund:/)
    expect(memoryJobs.listReceipts()[0]?.kind).toBe('content-refund')
  })

  it('expiry with no pick refunds the agent', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    const job = memoryJobs.createContentJob({
      createdBy: 'agent',
      title: 'Expiring thread',
      spec: 'Post before the deadline.',
      contentKind: 'thread',
      chainId: 'solana-devnet',
      asset: 'SOL',
      reward: parseAmountToBigint(1),
      deadline: Date.now() + 60_000,
    })
    const rail = simSettlementRail()
    const { escrow } = await rail.fund({ chainId: job.chainId, asset: job.asset }, { amount: job.budget })
    job.escrowRef = escrow.id
    job.escrowFrom = 'AgentWallet'
    job.status = 'funded'
    memoryJobs.setJob(job)
    memoryJobs.submitContentProof(job.id, {
      wallet: 'Human',
      xUrl: 'https://x.com/h/status/3',
    })
    vi.setSystemTime(Date.now() + 120_000)
    const out = await expireContentJobIfNeeded(job, { to: 'AgentWallet' })
    expect(out.job.status).toBe('expired')
    expect(out.receipt?.kind).toBe('content-expired')
    expect(out.txRef).toMatch(/sim-refund:/)
  })

  it('cannot pick twice', async () => {
    const job = memoryJobs.createContentJob({
      createdBy: 'agent',
      title: 'Once',
      spec: 'One winner only.',
      contentKind: 'post',
      chainId: 'solana-devnet',
      asset: 'SOL',
      reward: parseAmountToBigint(1),
      deadline: Date.now() + 86_400_000,
    })
    const rail = simSettlementRail()
    const { escrow } = await rail.fund({ chainId: job.chainId, asset: job.asset }, { amount: job.budget })
    job.escrowRef = escrow.id
    job.status = 'funded'
    memoryJobs.setJob(job)
    const a = memoryJobs.submitContentProof(job.id, { wallet: 'A', xUrl: 'https://x.com/a/status/1' })
    const b = memoryJobs.submitContentProof(job.id, { wallet: 'B', xUrl: 'https://x.com/b/status/2' })
    await pickContentWinner(job, a.id, {})
    await expect(pickContentWinner(memoryJobs.getJob(job.id)!, b.id, {})).rejects.toThrow(/paid|already/i)
  })
})
