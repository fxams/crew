import { describe, expect, it } from 'vitest'
import { kolFoundingTopN } from './founding-snapshot.js'

describe('founding snapshot config', () => {
  it('defaults top N to 500', () => {
    delete process.env.KOL_FOUNDING_TOP_N
    expect(kolFoundingTopN()).toBe(500)
  })
})
