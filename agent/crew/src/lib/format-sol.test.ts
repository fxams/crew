import { describe, expect, it } from 'vitest'
import { formatSol, formatSolSigned } from './format-sol'

describe('formatSol', () => {
  it('keeps tiny remits visible (not 0.0000)', () => {
    expect(formatSol(0.0000123)).toBe('0.0000123')
    expect(formatSol(1e-5)).toBe('0.00001')
    expect(formatSol(5.5e-6)).toBe('0.0000055')
  })

  it('formats typical remits without trailing zeros', () => {
    expect(formatSol(0.02)).toBe('0.02')
    expect(formatSol(1.5)).toBe('1.5')
    expect(formatSol(0)).toBe('0')
  })

  it('signs positive remits for tape/feed', () => {
    expect(formatSolSigned(0.00001)).toBe('+0.00001')
    expect(formatSolSigned(0)).toBe('0')
  })
})
