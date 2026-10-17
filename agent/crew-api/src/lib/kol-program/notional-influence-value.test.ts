import { describe, expect, it } from 'vitest'
import { computeNotionalInfluenceValueUsd } from './notional-influence-value.js'

describe('computeNotionalInfluenceValueUsd', () => {
  it('increases with followers and impressions', () => {
    const low = computeNotionalInfluenceValueUsd({
      followers: 500,
      avgImpressions: 200,
      engagementRate: 0.02,
      accountAgeDays: 100,
      referralCount: 0,
    })
    const high = computeNotionalInfluenceValueUsd({
      followers: 5_000_000,
      avgImpressions: 50_000,
      engagementRate: 0.04,
      accountAgeDays: 100,
      referralCount: 0,
    })
    expect(high).toBeGreaterThan(low)
    expect(high).toBeGreaterThan(1000)
  })

  it('returns non-negative integers', () => {
    const v = computeNotionalInfluenceValueUsd({
      followers: 0,
      avgImpressions: 0,
      engagementRate: 0,
      accountAgeDays: 0,
      referralCount: 0,
    })
    expect(v).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(v)).toBe(true)
  })
})
