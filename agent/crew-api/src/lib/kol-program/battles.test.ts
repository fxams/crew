import { describe, expect, it } from 'vitest'
import { battleHashtag, pickBattleWinner } from './battles.js'

describe('kol battles', () => {
  it('builds CPB hashtag', () => {
    expect(battleHashtag('cpb_abc123def')).toMatch(/^#CPB/)
  })

  it('picks higher engagement rate', () => {
    expect(
      pickBattleWinner(
        { handle: 'a', engagementRate: 0.02 },
        { handle: 'b', engagementRate: 0.05 },
      ),
    ).toBe('b')
  })
})
