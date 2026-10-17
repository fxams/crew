import { describe, expect, it } from 'vitest'
import { utcMidnightCountdown, verifyFollowingHqFromPage } from './x-engagement.js'

describe('x-engagement helpers', () => {
  it('matches HQ follow from a following page', () => {
    expect(
      verifyFollowingHqFromPage(
        [
          { id: '1', username: 'other' },
          { id: '99', username: 'CrewPayHQ' },
        ],
        '99',
      ),
    ).toBe(true)
    expect(verifyFollowingHqFromPage([{ id: '1', username: 'other' }], '99')).toBe(false)
  })

  it('counts down to next UTC midnight', () => {
    const at = Date.UTC(2026, 9, 17, 10, 30, 0)
    const c = utcMidnightCountdown(at)
    expect(c.label).toBe('13h 30m')
    expect(c.resetAt).toBe('2026-10-18T00:00:00.000Z')
  })
})
