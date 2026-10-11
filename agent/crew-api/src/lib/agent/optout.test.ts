import { describe, expect, it } from 'vitest'
import { buildHouseSet, buildOptOutSet, isHouseHandle, isOptedOut, normalizeHandle } from './optout.js'
import { buildCrewLeaderboardFromRemits } from '../proof.js'
import { planNarrativeHires } from './narrative.js'

const REG = [
  {
    handle: '@crewpayhq',
    wallet: '5gD6yf3b3ixHG3abuVQ6vMAjE5NDXVjgGaePNVXBZGev',
    followers: 6,
    registeredAt: '2026-10-09T00:00:00Z',
  },
]
const INPUT = { name: 'Viral Cat', ticker: 'CAT', vibe: 'a trench meme about a viral cat' }

describe('autohire opt-out', () => {
  it('normalizes handles and urls', () => {
    expect(normalizeHandle('@@CrewPayHQ ')).toBe('crewpayhq')
    expect(normalizeHandle('https://x.com/Foo')).toBe('foo')
  })

  it('merges file entries and env', () => {
    const s = buildOptOutSet([{ handle: '@A' }, { handle: '' }], 'b, @C  d')
    expect([...s].sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(buildOptOutSet([], undefined).size).toBe(0)
  })

  it('isOptedOut is false for an empty list', () => {
    expect(isOptedOut(['anyone'], new Set())).toBe(false)
    expect(isOptedOut(['@Anyone', null], new Set(['anyone']))).toBe(true)
  })

  it('default list (shipped file) excludes the house account @crewpayhq', () => {
    const plan = planNarrativeHires(INPUT, { limit: 5, registered: REG })
    expect(plan.crew.some((c) => c.handle.toLowerCase() === '@crewpayhq')).toBe(false)
    expect(plan.crew.length).toBe(5)
    expect(isHouseHandle('@CrewPayHQ')).toBe(true)
    expect(isHouseHandle('@blknoiz06')).toBe(false)
  })

  it('house set only includes house entries', () => {
    const s = buildHouseSet([{ handle: '@a', house: true }, { handle: '@b' }])
    expect([...s]).toEqual(['a'])
  })

  it('crew leaderboard hides house handles', () => {
    const rows = buildCrewLeaderboardFromRemits([
      { handle: '@crewpayhq', amountSol: 1, role: 'crew', ticker: 'X' },
      { handle: '@blknoiz06', amountSol: 0.1, role: 'crew', ticker: 'X' },
    ] as never, 8)
    expect(rows.map((r) => r.handle)).toEqual(['@blknoiz06'])
  })

  it('excludes an opted-out registered handle (synthetic row)', () => {
    const base = planNarrativeHires(INPUT, { limit: 5, registered: REG, optOut: new Set() })
    expect(base.crew.some((c) => c.handle.toLowerCase() === '@crewpayhq')).toBe(true)
    const plan = planNarrativeHires(INPUT, { limit: 5, registered: REG, optOut: new Set(['crewpayhq']) })
    expect(plan.crew.some((c) => c.handle.toLowerCase() === '@crewpayhq')).toBe(false)
    expect(plan.crew.length).toBe(5)
    expect(plan.crew.reduce((s, c) => s + c.share, 0)).toBe(100)
  })

  it('excludes an opted-out kol-db handle and backfills the seat', () => {
    const base = planNarrativeHires(INPUT, { limit: 5, optOut: new Set() })
    const victim = base.crew[0]!.handle.replace(/^@/, '').toLowerCase()
    const plan = planNarrativeHires(INPUT, { limit: 5, optOut: new Set([victim]) })
    expect(plan.crew.some((c) => c.handle.replace(/^@/, '').toLowerCase() === victim)).toBe(false)
    expect(plan.crew.length).toBe(5)
    expect(plan.crew.every((c) => c.wallet.length >= 32)).toBe(true)
  })
})
