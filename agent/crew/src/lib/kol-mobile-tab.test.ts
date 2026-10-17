import { describe, expect, it } from 'vitest'
import { kolMobileTabActive } from './kol-mobile-tab'

describe('kolMobileTabActive', () => {
  it('marks Board only on /kol/leaderboard', () => {
    expect(kolMobileTabActive('/kol/leaderboard', '', 'board')).toBe(true)
    expect(kolMobileTabActive('/kol', '', 'board')).toBe(false)
    expect(kolMobileTabActive('/kol/leaderboard', '', 'alerts')).toBe(false)
    expect(kolMobileTabActive('/kol/leaderboard', '', 'home')).toBe(false)
  })

  it('does not let Alerts steal Board', () => {
    expect(kolMobileTabActive('/kol/leaderboard', '', 'alerts')).toBe(false)
    expect(kolMobileTabActive('/kol', '#alerts', 'alerts')).toBe(true)
    expect(kolMobileTabActive('/kol', '#alerts', 'home')).toBe(false)
  })

  it('marks My card on the signed-in profile', () => {
    expect(kolMobileTabActive('/kol/mubaraqabba', '', 'card', 'mubaraqabba')).toBe(true)
    expect(kolMobileTabActive('/kol/other', '', 'card', 'mubaraqabba')).toBe(false)
    expect(kolMobileTabActive('/kol/mubaraqabba', '', 'card', null)).toBe(false)
  })
})
