import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAFT,
  DESK_MODES,
  LAUNCH_DESK_MODES,
  equalShares,
  resizeCrew,
  totalShare,
  withEqualShares,
} from './data'
import { MAX_CREW } from './lib/config'

describe('DESK_MODES copy', () => {
  it('keeps honest 25% CrewPay treasury language on every mode', () => {
    for (const mode of DESK_MODES) {
      expect(mode.blurb).toMatch(/25% CrewPay treasury/)
      expect(mode.blurb).not.toMatch(/CREW treasury fee-share|CREW buyback/)
    }
  })

  it('offers agent / split / buyback on the launch desk, not raid', () => {
    expect(LAUNCH_DESK_MODES.map((m) => m.id)).toEqual(['agent', 'split', 'buyback'])
    expect(DEFAULT_DRAFT.mode).toBe('agent')
  })
})

describe('equalShares', () => {
  it('always sums to 100 for 1–MAX_CREW', () => {
    for (let n = 1; n <= MAX_CREW; n++) {
      const shares = equalShares(n)
      expect(shares).toHaveLength(n)
      expect(shares.reduce((s, v) => s + v, 0)).toBe(100)
    }
  })

  it('splits 3 and 10 evenly with remainder up front', () => {
    expect(equalShares(3)).toEqual([34, 33, 33])
    expect(equalShares(10)).toEqual([10, 10, 10, 10, 10, 10, 10, 10, 10, 10])
  })
})

describe('resizeCrew', () => {
  it('grows and shrinks with equal percents', () => {
    const grown = resizeCrew([{ handle: '@a', wallet: '', share: 100 }], 4)
    expect(grown).toHaveLength(4)
    expect(totalShare(grown)).toBe(100)
    expect(grown[0]?.handle).toBe('@a')

    const shrunk = resizeCrew(grown, 2)
    expect(shrunk).toHaveLength(2)
    expect(totalShare(shrunk)).toBe(100)
  })

  it('withEqualShares rebalances without changing seats', () => {
    const next = withEqualShares([
      { handle: '@a', wallet: '', share: 90 },
      { handle: '@b', wallet: '', share: 10 },
    ])
    expect(next.map((m) => m.share)).toEqual([50, 50])
  })
})
