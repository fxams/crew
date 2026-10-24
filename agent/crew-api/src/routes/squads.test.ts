import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApiApp } from '../api-app.js'
import { resetSquadsCacheForTests, squadsProviderNeedle } from '../lib/squads-proxy.js'

const host = squadsProviderNeedle()

describe('squads HTTP proxy', () => {
  const prevUpstream = process.env.SQUADS_UPSTREAM_URL
  const prevKol = process.env.KOL_PROGRAM_ENABLED

  beforeEach(() => {
    resetSquadsCacheForTests()
    process.env.SQUADS_UPSTREAM_URL = 'https://squads-upstream.test'
    delete process.env.KOL_PROGRAM_ENABLED
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/v1/squads/copy')) {
          return new Response(
            JSON.stringify({
              mode: 'paper',
              methodology_url: `https://${host}.example/m`,
              dispute_contact: `ceo@${host}.example`,
              note: 'paper only',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        if (url.includes('/v1/squads/charts.json')) {
          return new Response(
            JSON.stringify({
              meta: { methodology_url: `https://${host}.example/m` },
              squads: [{ id: 'alpha-1', name: 'Alpha', tokens: [] }],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        if (url.includes('/v1/squads/token_chart.json')) {
          if (url.includes('11111111111111111111111111111112')) {
            return new Response(JSON.stringify({ error: 'not found' }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          return new Response(
            JSON.stringify({
              meta: { dispute_contact: `ceo@${host}.example` },
              chart: {
                squad: 'alpha-1',
                mint: '4ugDhHJ8XDXAeABmrNmGffFaLbJb9BkPyiFGVSV9ocwo',
                symbol: 'OWL',
                candles: [[1_761_000_000, 1, 2, 0.5, 1.5, 10]],
                markers: [],
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({
            status: 'pre-start',
            methodology_url: `https://${host}.example/m`,
            dispute_contact: `ceo@${host}.example`,
            notes: ['public note', `${host} credit`],
            squads: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetSquadsCacheForTests()
    if (prevUpstream === undefined) delete process.env.SQUADS_UPSTREAM_URL
    else process.env.SQUADS_UPSTREAM_URL = prevUpstream
    if (prevKol === undefined) delete process.env.KOL_PROGRAM_ENABLED
    else process.env.KOL_PROGRAM_ENABLED = prevKol
  })

  it('returns 503 when the upstream origin is unset', async () => {
    delete process.env.SQUADS_UPSTREAM_URL
    const res = await request(createApiApp()).get('/api/squads/dashboard')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'squads feed not configured' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('proxies the dashboard, strips provider fields, and sets cache headers', async () => {
    const res = await request(createApiApp()).get('/api/squads/dashboard')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('public, max-age=300')
    expect(res.body).toEqual({ status: 'pre-start', notes: ['public note'], squads: [] })
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain(host)
    expect(res.body.methodology_url).toBeUndefined()
    expect(res.body.dispute_contact).toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(
      'https://squads-upstream.test/v1/squads/dashboard.json',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    )
  })

  it('requires a valid squad id on copy', async () => {
    const missing = await request(createApiApp()).get('/api/squads/copy')
    expect(missing.status).toBe(400)
    expect(missing.body).toEqual({ error: 'invalid squad' })

    const bad = await request(createApiApp()).get('/api/squads/copy?squad=../x')
    expect(bad.status).toBe(400)

    const ok = await request(createApiApp()).get('/api/squads/copy?squad=alpha-1')
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ mode: 'paper', note: 'paper only' })
    expect(fetch).toHaveBeenCalledWith(
      'https://squads-upstream.test/v1/squads/copy?squad=alpha-1',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    )
  })

  it('is reachable when the KOL program gate is off', async () => {
    delete process.env.KOL_PROGRAM_ENABLED
    const res = await request(createApiApp()).get('/api/squads/dashboard')
    expect(res.status).toBe(200)
  })

  it('proxies the charts index and strips provider fields', async () => {
    const res = await request(createApiApp()).get('/api/squads/charts')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('public, max-age=300')
    expect(res.body).toEqual({ meta: {}, squads: [{ id: 'alpha-1', name: 'Alpha', tokens: [] }] })
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain(host)
    expect(fetch).toHaveBeenCalledWith(
      'https://squads-upstream.test/v1/squads/charts.json',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    )
  })

  it('validates squad and mint on token-chart and passes a 404 through', async () => {
    const badSquad = await request(createApiApp()).get(
      '/api/squads/token-chart?squad=../x&mint=4ugDhHJ8XDXAeABmrNmGffFaLbJb9BkPyiFGVSV9ocwo',
    )
    expect(badSquad.status).toBe(400)
    expect(badSquad.body).toEqual({ error: 'invalid squad' })

    const badMint = await request(createApiApp()).get('/api/squads/token-chart?squad=alpha-1&mint=short')
    expect(badMint.status).toBe(400)
    expect(badMint.body).toEqual({ error: 'invalid mint' })

    const missingMint = '11111111111111111111111111111112'
    const missing = await request(createApiApp()).get(
      `/api/squads/token-chart?squad=alpha-1&mint=${missingMint}`,
    )
    expect(missing.status).toBe(404)

    const ok = await request(createApiApp()).get(
      '/api/squads/token-chart?squad=alpha-1&mint=4ugDhHJ8XDXAeABmrNmGffFaLbJb9BkPyiFGVSV9ocwo',
    )
    expect(ok.status).toBe(200)
    expect(ok.body.chart.symbol).toBe('OWL')
    expect(ok.body.meta).toEqual({})
    expect(JSON.stringify(ok.body).toLowerCase()).not.toContain(host)
    expect(fetch).toHaveBeenCalledWith(
      'https://squads-upstream.test/v1/squads/token_chart.json?squad=alpha-1&mint=4ugDhHJ8XDXAeABmrNmGffFaLbJb9BkPyiFGVSV9ocwo',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    )
  })

  it('returns 503 on charts when the upstream origin is unset', async () => {
    delete process.env.SQUADS_UPSTREAM_URL
    const res = await request(createApiApp()).get('/api/squads/charts')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'squads feed not configured' })
  })
})
