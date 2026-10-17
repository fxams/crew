import { describe, expect, it } from 'vitest'
import { formatReachFormulaDoc } from './kol-program'

describe('formatReachFormulaDoc', () => {
  it('stringifies REACH_FORMULA_DOC-shaped objects', () => {
    const doc = {
      weights: { followers: 0.3 },
      caps: { accountAgeYears: 3 },
      tiers: { bronze: [0, 39] },
    }
    const out = formatReachFormulaDoc(doc)
    expect(out).toContain('"weights"')
    expect(out).toContain('0.3')
  })

  it('passes through string docs', () => {
    expect(formatReachFormulaDoc('followers 30%')).toBe('followers 30%')
  })
})
