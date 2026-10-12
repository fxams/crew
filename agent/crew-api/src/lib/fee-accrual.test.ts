import { afterEach, describe, expect, it } from 'vitest'
import {
  accrualTtlMs,
  getAccruedFees,
  resetFeeAccrual,
  setFeeAccrualDeps,
  shouldStartAccrualPoller,
} from './fee-accrual.js'

describe('per-mint fee accrual cache', () => {
  afterEach(() => {
    resetFeeAccrual()
    setFeeAccrualDeps({})
    delete process.env.KICKOFF_ACCRUAL_TTL_MS
    delete process.env.KICKOFF_ACCRUAL_POLL
  })

  it('sums remits + unclaimed and caches until TTL', async () => {
    let remits = 0
    let chain = 0
    setFeeAccrualDeps({
      now: () => 1_000,
      distributedSol: async () => {
        remits += 1
        return 1.5
      },
      chain: async () => {
        chain += 1
        return { unclaimedSol: 0.25, unclaimedEth: null, sharingConfig: true }
      },
    })
    process.env.KICKOFF_ACCRUAL_TTL_MS = '120000'
    const a = await getAccruedFees('Mint111111111111111111111111111111111111111', { now: 1_000 })
    expect(a.distributedSol).toBe(1.5)
    expect(a.unclaimedSol).toBe(0.25)
    expect(a.accruedSol).toBe(1.75)
    expect(a.sharingConfig).toBe(true)
    expect(a.source).toBe('remits+chain')
    const b = await getAccruedFees('Mint111111111111111111111111111111111111111', { now: 30_000 })
    expect(b.source).toBe('cache')
    expect(b.accruedSol).toBe(1.75)
    expect(remits).toBe(1)
    expect(chain).toBe(1)
  })

  it('refreshes after TTL (1–5 min clamp)', async () => {
    process.env.KICKOFF_ACCRUAL_TTL_MS = '1000'
    expect(accrualTtlMs()).toBe(60_000)
    let n = 0
    setFeeAccrualDeps({
      now: () => 0,
      distributedSol: async () => {
        n += 1
        return n
      },
      chain: async () => ({ unclaimedSol: 0, unclaimedEth: null, sharingConfig: false }),
    })
    await getAccruedFees('Mint222222222222222222222222222222222222222', { now: 0 })
    await getAccruedFees('Mint222222222222222222222222222222222222222', {
      now: 59_000,
    })
    expect(n).toBe(1)
    const late = await getAccruedFees('Mint222222222222222222222222222222222222222', {
      now: 61_000,
    })
    expect(n).toBe(2)
    expect(late.accruedSol).toBe(2)
  })

  it('does not start the poller under vitest', () => {
    expect(shouldStartAccrualPoller()).toBe(false)
  })
})
