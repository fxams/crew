import { describe, expect, it } from 'vitest'
import { buildSeasonShoutoutText, hofBadgeLabel } from './hall-of-fame.js'

describe('hall of fame', () => {
  it('formats badge label', () => {
    expect(hofBadgeLabel(3)).toBe('Season 3 top KOL')
  })

  it('builds shoutout without earnings language', () => {
    const text = buildSeasonShoutoutText(2, [
      { rank: 1, handle: 'alpha', seasonPoints: 120 },
      { rank: 2, handle: 'beta', seasonPoints: 90 },
    ])
    expect(text).toContain('@CrewPayHQ')
    expect(text).toContain('@alpha')
    expect(text).toContain('120 pts')
    expect(text).not.toMatch(/\$\d|earn|payout|SOL|ETH/i)
    expect(text).toMatch(/no cash or token/i)
  })
})
