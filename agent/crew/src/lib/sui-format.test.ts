import { describe, expect, it } from 'vitest'
import { formatSui, parseSuiInput, poolDisplayName, stageLabel } from './sui-format'

describe('sui-format', () => {
  it('formats and parses SUI amounts', () => {
    expect(formatSui(1_500_000_000n)).toBe('1.5')
    expect(parseSuiInput('0.52')).toBe(520_000_000n)
  })

  it('labels pool display', () => {
    expect(poolDisplayName({ memeCoinType: '0xabc::meme::MEME', symbol: 'HOOT' })).toBe('HOOT')
    expect(stageLabel('migrated')).toBe('Migrated')
  })
})
