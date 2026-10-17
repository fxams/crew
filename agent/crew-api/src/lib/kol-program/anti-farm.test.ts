import { describe, expect, it } from 'vitest'
import { checkAntiFarm } from './anti-farm.js'

describe('checkAntiFarm', () => {
  it('rejects young accounts', () => {
    const r = checkAntiFarm({ accountAgeDays: 5, followers: 100, referralsToday: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('min_account_age')
  })

  it('accepts healthy accounts', () => {
    expect(
      checkAntiFarm({ accountAgeDays: 90, followers: 200, referralsToday: 1 }).ok,
    ).toBe(true)
  })
})
