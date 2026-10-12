import { describe, expect, it } from 'vitest'
import { creatorFeeSplit, FEE_SPLIT_DEFAULT, FEE_SPLIT_REFERRED } from './fee-split'

describe('creatorFeeSplit', () => {
  it('defaults to 60 hired KOL crew / 15 launching agent / 25 treasury', () => {
    expect(FEE_SPLIT_DEFAULT).toEqual({ crew: 60, agent: 15, referrer: 0, treasury: 25 })
    expect(creatorFeeSplit(false).crew + creatorFeeSplit(false).agent + creatorFeeSplit(false).treasury).toBe(
      100,
    )
  })

  it('referred state is 60 / 15 / 5 / 20 and still sums to 100', () => {
    expect(FEE_SPLIT_REFERRED).toEqual({ crew: 60, agent: 15, referrer: 5, treasury: 20 })
    const s = creatorFeeSplit(true)
    expect(s.crew + s.agent + s.referrer + s.treasury).toBe(100)
  })

  it('does not give the launcher the 60% crew slice', () => {
    expect(creatorFeeSplit(false).agent).toBe(15)
    expect(creatorFeeSplit(false).crew).toBe(60)
    expect(creatorFeeSplit(true).agent).toBe(15)
  })
})
