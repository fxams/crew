import { afterEach, describe, expect, it } from 'vitest'
import { assertCanSetFeatured, featuredXHandle, parseFeaturedXUrl } from './featured.js'

describe('featured @CrewPayHQ URL', () => {
  afterEach(() => {
    delete process.env.CREW_FEATURED_X_HANDLE
  })

  it('accepts CrewPayHQ status URLs and normalizes them', () => {
    const p = parseFeaturedXUrl('https://x.com/CrewPayHQ/status/1234567890123456789?s=20')
    expect(p.handle).toBe('CrewPayHQ')
    expect(p.statusId).toBe('1234567890123456789')
    expect(p.url).toBe('https://x.com/CrewPayHQ/status/1234567890123456789')
  })

  it('rejects other handles, hosts, and non-status paths', () => {
    expect(() => parseFeaturedXUrl('https://x.com/someone/status/1')).toThrow(/CrewPayHQ/)
    expect(() => parseFeaturedXUrl('https://example.com/CrewPayHQ/status/1')).toThrow(/x\.com/)
    expect(() => parseFeaturedXUrl('https://x.com/CrewPayHQ')).toThrow(/status/)
    expect(() => parseFeaturedXUrl('http://x.com/CrewPayHQ/status/1')).toThrow(/https/)
  })

  it('only stores a featured URL after graduation', () => {
    expect(() =>
      assertCanSetFeatured({
        coin: { graduatedAt: undefined },
        url: 'https://x.com/CrewPayHQ/status/1',
      }),
    ).toThrow(/graduation/)
    expect(
      assertCanSetFeatured({
        coin: { graduatedAt: 1_700_000_000_000 },
        url: 'https://x.com/CrewPayHQ/status/99',
      }).url,
    ).toBe('https://x.com/CrewPayHQ/status/99')
    expect(() =>
      assertCanSetFeatured({
        coin: { graduatedAt: 1 },
        url: 'https://x.com/notcrew/status/99',
      }),
    ).toThrow(/CrewPayHQ/)
  })

  it('handle is configurable', () => {
    process.env.CREW_FEATURED_X_HANDLE = '@DeskCrew'
    expect(featuredXHandle()).toBe('DeskCrew')
    expect(parseFeaturedXUrl('https://twitter.com/DeskCrew/status/99').url).toBe(
      'https://x.com/DeskCrew/status/99',
    )
  })
})
