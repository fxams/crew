import { describe, expect, it } from 'vitest'
import {
  TG_REACH_SCORE_CAP,
  TG_REACH_STALE_MS,
  applyTelegramReachBoost,
  telegramReachBoost,
  telegramReachEligible,
} from './telegram-reach.js'

const FRESH = new Date('2026-10-01T00:00:00.000Z').toISOString()
const NOW = Date.parse('2026-10-13T00:00:00.000Z')

describe('telegramReachBoost', () => {
  it('zeros unverified reach even when member count is huge', () => {
    expect(
      telegramReachBoost(80, { verified: false, reach: 9_999_999, verifiedAt: FRESH, nowMs: NOW }),
    ).toBe(0)
    expect(telegramReachEligible({ verified: false, reach: 50_000 })).toBe(false)
  })

  it('zeros missing, non-positive, and stale verified channels', () => {
    expect(telegramReachBoost(80, { verified: true, reach: null, nowMs: NOW })).toBe(0)
    expect(telegramReachBoost(80, { verified: true, reach: 0, verifiedAt: FRESH, nowMs: NOW })).toBe(0)
    const staleAt = NOW - TG_REACH_STALE_MS - 1
    expect(
      telegramReachBoost(80, { verified: true, reach: 50_000, verifiedAt: staleAt, nowMs: NOW }),
    ).toBe(0)
  })

  it('uses log-scaled reach and caps at 10% of the pre-TG score', () => {
    const base = 80
    const boost = telegramReachBoost(base, {
      verified: true,
      reach: 1_000_000,
      verifiedAt: FRESH,
      nowMs: NOW,
    })
    expect(boost).toBeGreaterThan(0)
    expect(boost).toBeLessThanOrEqual(base * TG_REACH_SCORE_CAP + 1e-9)
    const small = telegramReachBoost(base, {
      verified: true,
      reach: 100,
      verifiedAt: FRESH,
      nowMs: NOW,
    })
    expect(small).toBeGreaterThan(0)
    expect(small).toBeLessThan(boost)
    const applied = applyTelegramReachBoost(base, {
      verified: true,
      reach: 1_000_000,
      verifiedAt: FRESH,
      nowMs: NOW,
    })
    expect(applied.score - base).toBe(applied.boost)
    expect(applied.boost / applied.score).toBeLessThanOrEqual(TG_REACH_SCORE_CAP / (1 + TG_REACH_SCORE_CAP) + 1e-9)
  })

  it('treats verified-without-timestamp as fresh (legacy rows)', () => {
    expect(telegramReachBoost(50, { verified: true, reach: 10_000, nowMs: NOW })).toBeGreaterThan(0)
  })
})
