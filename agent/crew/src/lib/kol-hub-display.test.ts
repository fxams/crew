import { describe, expect, it } from 'vitest'
import { hubMemberLine, hubRecentJoiners } from './kol-hub-display'

describe('hubMemberLine', () => {
  it('shows invite copy when count is low', () => {
    expect(hubMemberLine({ memberCount: 0, recentJoiners: [], seasonId: 's', seasonEndsAt: null, referralMilestones: [], disclaimer: '' }).primary).toBe(
      'Be one of the first',
    )
    expect(hubMemberLine({ memberCount: 2, recentJoiners: [], seasonId: 's', seasonEndsAt: null, referralMilestones: [], disclaimer: '' }).primary).toBe(
      'Be one of the first',
    )
  })

  it('shows real count when enough members', () => {
    const line = hubMemberLine({
      memberCount: 42,
      recentJoiners: [],
      seasonId: 's',
      seasonEndsAt: null,
      referralMilestones: [],
      disclaimer: '',
    })
    expect(line.primary).toBe('42')
    expect(line.secondary).toBe('members')
  })
})

describe('hubRecentJoiners', () => {
  it('drops empty handles', () => {
    expect(hubRecentJoiners([{ handle: 'a', enrolledAt: '', founderNumber: null }, { handle: '', enrolledAt: '', founderNumber: null }])).toEqual([
      { handle: 'a', enrolledAt: '', founderNumber: null },
    ])
  })
})
