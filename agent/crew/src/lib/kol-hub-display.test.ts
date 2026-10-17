import { describe, expect, it } from 'vitest'
import { hubMemberLine, hubRecentJoiners, hubStatTiles, podiumSlots, seasonChipLabel, seasonMonthLabel } from './kol-hub-display'
import type { KolLeaderboardRow } from './kol-program'

const emptyHub = {
  memberCount: 0,
  recentJoiners: [],
  seasonId: 's',
  seasonEndsAt: null,
  referralMilestones: [],
  disclaimer: '',
}

describe('hubMemberLine', () => {
  it('shows invite copy when count is low', () => {
    expect(hubMemberLine({ ...emptyHub, memberCount: 0 }).primary).toBe('Be one of the first')
    expect(hubMemberLine({ ...emptyHub, memberCount: 2 }).primary).toBe('Be one of the first')
  })

  it('shows real count when enough members', () => {
    const line = hubMemberLine({ ...emptyHub, memberCount: 42 })
    expect(line.primary).toBe('42')
    expect(line.secondary).toBe('members')
  })
})

describe('hubRecentJoiners', () => {
  it('drops empty handles', () => {
    expect(
      hubRecentJoiners([
        { handle: 'a', enrolledAt: '', founderNumber: null },
        { handle: '', enrolledAt: '', founderNumber: null },
      ]),
    ).toEqual([{ handle: 'a', enrolledAt: '', founderNumber: null }])
  })
})

describe('hubStatTiles', () => {
  it('returns three tiles with real countdown values', () => {
    const tiles = hubStatTiles({
      ...emptyHub,
      memberCount: 1,
      seasonEndsAt: new Date(Date.now() + 15 * 86400000 + 2 * 3600000).toISOString(),
      foundingSnapshotAt: new Date(Date.now() + 14 * 86400000 + 22 * 3600000).toISOString(),
    })
    expect(tiles).toHaveLength(3)
    expect(tiles[0]?.value).toBe('Be one of the first')
    expect(tiles[1]?.label).toBe('Season ending soon')
    expect(tiles[1]?.value).toMatch(/^\d+d \d+h$/)
    expect(tiles[2]?.label).toBe('Founding snapshot')
    expect(tiles[2]?.value).toMatch(/^\d+d \d+h$/)
  })
})

describe('seasonChipLabel', () => {
  it('builds a one-line season chip', () => {
    expect(seasonMonthLabel('season_2026-10')).toBe('Oct')
    expect(seasonChipLabel('season_2026-10', '2026-11-01T00:00:00.000Z', Date.parse('2026-10-17T17:00:00.000Z'))).toBe(
      'Season Oct · ends in 14d',
    )
  })
})

describe('podiumSlots', () => {
  const row = (rank: number, handle: string): KolLeaderboardRow => ({
    rank,
    handle,
    seasonPoints: 0,
    reachScore: 44,
    tier: 'silver',
    founderNumber: rank,
  })

  it('fills #1 and leaves 2–3 as placeholders', () => {
    const slots = podiumSlots([row(1, 'mubaraqabba')])
    expect(slots.map((s) => s.place)).toEqual([2, 1, 3])
    expect(slots[0]?.row).toBeNull()
    expect(slots[1]?.row?.handle).toBe('mubaraqabba')
    expect(slots[2]?.row).toBeNull()
  })
})
