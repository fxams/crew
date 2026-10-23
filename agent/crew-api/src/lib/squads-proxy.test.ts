import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  copyUpstreamUrl,
  dashboardUpstreamUrl,
  fetchSquadsUpstream,
  resetSquadsCacheForTests,
  squadsProviderNeedle,
  squadsUpstreamOrigin,
  stripSquadsPayload,
  validateSquadId,
} from './squads-proxy.js'

const host = squadsProviderNeedle()

describe('squadsUpstreamOrigin', () => {
  const prev = process.env.SQUADS_UPSTREAM_URL

  afterEach(() => {
    if (prev === undefined) delete process.env.SQUADS_UPSTREAM_URL
    else process.env.SQUADS_UPSTREAM_URL = prev
  })

  it('reads env only and rejects missing or invalid values', () => {
    delete process.env.SQUADS_UPSTREAM_URL
    expect(squadsUpstreamOrigin()).toBe(null)
    process.env.SQUADS_UPSTREAM_URL = '   '
    expect(squadsUpstreamOrigin()).toBe(null)
    process.env.SQUADS_UPSTREAM_URL = 'not-a-url'
    expect(squadsUpstreamOrigin()).toBe(null)
    process.env.SQUADS_UPSTREAM_URL = 'https://squads-upstream.test/'
    expect(squadsUpstreamOrigin()).toBe('https://squads-upstream.test')
  })
})

describe('stripSquadsPayload', () => {
  it('drops methodology, dispute, matching keys, and matching strings', () => {
    const cleaned = stripSquadsPayload({
      methodology_url: 'https://example.com/method',
      dispute_contact: 'ops@example.com',
      [host]: 'secret',
      notes: [`via ${host}.example`, 'keep this note'],
      source: `https://${host}.example/v1`,
      nest: { url: `https://${host}.example/x`, ok: true },
      keep: 'UTC only',
      score: 12,
    }) as Record<string, unknown>
    expect(cleaned).toEqual({
      notes: ['keep this note'],
      nest: { ok: true },
      keep: 'UTC only',
      score: 12,
    })
    expect(JSON.stringify(cleaned).toLowerCase()).not.toContain(host)
    expect(cleaned).not.toHaveProperty('methodology_url')
    expect(cleaned).not.toHaveProperty('dispute_contact')
  })
})

describe('validateSquadId', () => {
  it('accepts conservative ids only', () => {
    expect(validateSquadId('alpha-1')).toBe('alpha-1')
    expect(validateSquadId('A_b9')).toBe('A_b9')
    expect(validateSquadId('')).toBe(null)
    expect(validateSquadId('../x')).toBe(null)
    expect(validateSquadId('has space')).toBe(null)
    expect(validateSquadId('https://evil.test')).toBe(null)
  })
})

describe('upstream paths', () => {
  it('appends the v1 squads paths to the origin', () => {
    expect(dashboardUpstreamUrl('https://squads-upstream.test')).toBe(
      'https://squads-upstream.test/v1/squads/dashboard.json',
    )
    expect(copyUpstreamUrl('https://squads-upstream.test', 'alpha-1')).toBe(
      'https://squads-upstream.test/v1/squads/copy?squad=alpha-1',
    )
  })
})

describe('fetchSquadsUpstream', () => {
  beforeEach(() => {
    resetSquadsCacheForTests()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            status: 'pre-start',
            methodology_url: 'https://example.com/m',
            notes: ['ok', `${host} leak`],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetSquadsCacheForTests()
  })

  it('strips, caches, and reuses the cleaned body', async () => {
    const first = await fetchSquadsUpstream('dash', 'https://squads-upstream.test/v1/squads/dashboard.json')
    const second = await fetchSquadsUpstream('dash', 'https://squads-upstream.test/v1/squads/dashboard.json')
    expect(first).toEqual({
      ok: true,
      body: { status: 'pre-start', notes: ['ok'] },
    })
    expect(second).toEqual(first)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('returns a graceful error when the upstream fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('timeout')
      }),
    )
    const out = await fetchSquadsUpstream('fail', 'https://squads-upstream.test/v1/squads/dashboard.json')
    expect(out).toEqual({ ok: false, status: 503, error: 'Squads feed is unavailable.' })
  })
})
