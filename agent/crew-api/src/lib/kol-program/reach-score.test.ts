import { describe, expect, it } from 'vitest'
import { computeReachScore, reachTier } from './reach-score.js'

describe('computeReachScore', () => {
  it('returns higher score for larger accounts', () => {
    const low = computeReachScore({
      followers: 50,
      avgImpressions: 100,
      engagementRate: 0.01,
      accountAgeDays: 40,
      referralCount: 0,
    })
    const high = computeReachScore({
      followers: 500_000,
      avgImpressions: 200_000,
      engagementRate: 0.08,
      accountAgeDays: 1200,
      referralCount: 25,
    })
    expect(high).toBeGreaterThan(low)
    expect(['gold', 'platinum']).toContain(reachTier(high))
  })
})
