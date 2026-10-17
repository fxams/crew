import { describe, expect, it } from 'vitest'
import { isKolReservedPathWord } from './reserved-paths.js'

describe('isKolReservedPathWord', () => {
  it('reserves program route words, not real handles', () => {
    expect(isKolReservedPathWord('tasks')).toBe(true)
    expect(isKolReservedPathWord('leaderboard')).toBe(true)
    expect(isKolReservedPathWord('founders')).toBe(true)
    expect(isKolReservedPathWord('alerts')).toBe(true)
    expect(isKolReservedPathWord('battles')).toBe(true)
    expect(isKolReservedPathWord('me')).toBe(true)
    expect(isKolReservedPathWord('hub')).toBe(true)
    expect(isKolReservedPathWord('card')).toBe(true)
    expect(isKolReservedPathWord('settings')).toBe(true)
    expect(isKolReservedPathWord('mubaraqabba')).toBe(false)
    expect(isKolReservedPathWord('CrewPayHQ')).toBe(false)
  })
})
