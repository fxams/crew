import { describe, expect, it } from 'vitest'
import { assessKolQuality } from './kol-quality.js'

describe('kol quality (anti-fake engagement)', () => {
  it('flags low engagement relative to followers', () => {
    const q = assessKolQuality({
      handle: 'bigkol',
      followers: 200_000,
      avgLikesPerPost: 1,
      dbRank: 50,
    })
    expect(q.flags.some((f) => /engagement/i.test(f))).toBe(true)
    expect(q.autohirePenalty).toBeGreaterThan(0)
  })

  it('excludes suspicious bot-like accounts from autohire', () => {
    const q = assessKolQuality({
      handle: 'user99999',
      followers: 120_000,
      tweetCount: 12,
      dbRank: 900,
    })
    expect(q.excluded).toBe(true)
  })

  it('passes healthy registered-style accounts', () => {
    const q = assessKolQuality({
      handle: 'realct',
      followers: 25_000,
      accountAgeDays: 400,
      avgLikesPerPost: 80,
      dbRank: 120,
      tweetCount: 4000,
    })
    expect(q.excluded).toBe(false)
    expect(q.qualityScore).toBeGreaterThan(60)
  })
})
