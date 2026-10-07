import { describe, expect, it } from 'vitest'
import { DESK_MODES } from './data'
import { PLATFORM_BUYBACK_BPS } from './lib/config'

describe('DESK_MODES copy', () => {
  it('states the 25% CREW buyback on every mode (not 0%)', () => {
    const pct = PLATFORM_BUYBACK_BPS / 100
    expect(pct).toBe(25)
    for (const mode of DESK_MODES) {
      expect(mode.blurb).toContain(`${pct}% CREW buyback`)
      expect(mode.blurb.toLowerCase()).not.toMatch(/0%\s*platform/)
    }
  })
})
