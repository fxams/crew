import { describe, expect, it } from 'vitest'
import { kolDailyPointsCap } from './flags.js'

describe('kolDailyPointsCap', () => {
  it('defaults to 5000', () => {
    const prev = process.env.KOL_DAILY_POINTS_CAP
    delete process.env.KOL_DAILY_POINTS_CAP
    expect(kolDailyPointsCap()).toBe(5000)
    process.env.KOL_DAILY_POINTS_CAP = prev
  })
})
