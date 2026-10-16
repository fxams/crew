import { describe, expect, it, beforeEach } from 'vitest'
import {
  reputationScore,
  reputationWeightedShares,
  resetKolReputationStore,
  setKolReputationStats,
  tierFromScore,
} from './kol-reputation.js'

describe('kol reputation', () => {
  beforeEach(() => {
    resetKolReputationStore()
  })

  it('maps score to bronze / silver / gold tiers', () => {
    expect(tierFromScore(40)).toBe('bronze')
    expect(tierFromScore(55)).toBe('silver')
    expect(tierFromScore(80)).toBe('gold')
  })

  it('weights crew shares by reputation score', () => {
    setKolReputationStats('w1', { completedVerifiedJobs: 8, completedJobs: 10, onTimeJobs: 9 })
    setKolReputationStats('w2', { completedVerifiedJobs: 1, completedJobs: 2, onTimeJobs: 1 })
    const shares = reputationWeightedShares([{ wallet: 'w1' }, { wallet: 'w2' }], 100)
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100)
    expect(shares[0]).toBeGreaterThan(shares[1])
  })

  it('penalizes disputes in reputation score', () => {
    const base = reputationScore(
      setKolReputationStats('w', {
        completedVerifiedJobs: 3,
        completedJobs: 3,
        onTimeJobs: 3,
        disputesLost: 0,
      }),
    )
    const penalized = reputationScore(
      setKolReputationStats('w2', {
        completedVerifiedJobs: 3,
        completedJobs: 3,
        onTimeJobs: 3,
        disputesLost: 2,
      }),
    )
    expect(penalized).toBeLessThan(base)
  })
})
