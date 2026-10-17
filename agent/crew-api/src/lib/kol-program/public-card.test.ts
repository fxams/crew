import { describe, expect, it } from 'vitest'
import { scoreBarsFromInput } from './public-card.js'

const base = {
  followers: 1_000_000,
  avgImpressions: 50_000,
  engagementRate: 0.08,
  accountAgeDays: 2000,
  referralCount: 4,
}

describe('scoreBarsFromInput', () => {
  it('returns numeric bars when signals are known', () => {
    const bars = scoreBarsFromInput(base)
    const byLabel = Object.fromEntries(bars.map((b) => [b.label, b]))
    expect(byLabel.Engagement.value).toBeGreaterThan(0)
    expect(byLabel.Network.value).toBeGreaterThan(0)
    expect(byLabel.Followers.value).toBeGreaterThan(0)
  })

  it('uses em-dash-ready nulls when public X has no post or referral signal', () => {
    const bars = scoreBarsFromInput(
      { ...base, engagementRate: 0, referralCount: 0 },
      { engagementKnown: false, networkKnown: false },
    )
    const byLabel = Object.fromEntries(bars.map((b) => [b.label, b]))
    expect(byLabel.Engagement.value).toBeNull()
    expect(byLabel['Content quality'].value).toBeNull()
    expect(byLabel.Network.value).toBeNull()
    expect(byLabel.Engagement.hint).toMatch(/recent public posts/i)
    expect(byLabel.Network.hint).toMatch(/claim/i)
    expect(byLabel.Followers.value).toBeGreaterThan(0)
    expect(byLabel.Reach.value).toBeGreaterThan(0)
  })

  it('does not turn a real zero referral count into unavailable', () => {
    const bars = scoreBarsFromInput(
      { ...base, referralCount: 0 },
      { engagementKnown: true, networkKnown: true },
    )
    expect(bars.find((b) => b.label === 'Network')?.value).toBe(0)
  })
})
