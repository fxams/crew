import { describe, expect, it } from 'vitest'
import { isKolReservedPathWord } from './kol-reserved-paths'

describe('isKolReservedPathWord', () => {
  it('reserves program route words, not real handles', () => {
    for (const word of [
      'tasks',
      'leaderboard',
      'founders',
      'alerts',
      'battles',
      'me',
      'hub',
      'card',
      'settings',
      'TASKS',
      '@me',
    ]) {
      expect(isKolReservedPathWord(word)).toBe(true)
    }
    expect(isKolReservedPathWord('mubaraqabba')).toBe(false)
    expect(isKolReservedPathWord('CrewPayHQ')).toBe(false)
    expect(isKolReservedPathWord('vitalik')).toBe(false)
  })
})
