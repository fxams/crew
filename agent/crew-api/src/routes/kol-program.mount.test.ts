import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApiApp } from '../api-app.js'
import { resetSiteIndexCacheForTests } from '../lib/kol-program/share-html.js'

vi.mock('../lib/kol-session.js', () => ({
  readKolSessionCookie: vi.fn(() => ({ u: 'u1', h: 'alice' })),
}))

vi.mock('../lib/kol-program/store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/kol-program/store.js')>()
  return {
    ...actual,
    getCurrentSeasonId: vi.fn(async () => 'season_test'),
    programMemberCount: vi.fn(async () => 7),
    recentProgramJoiners: vi.fn(async () => [
      { handle: 'alice', enrolledAt: new Date().toISOString(), founderNumber: 2 },
    ]),
    leaderboard: vi.fn(async () => [
      {
        rank: 1,
        handle: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
        seasonPoints: 0,
        reachScore: 50,
        tier: 'silver',
        founderNumber: 2,
      },
    ]),
    getProgramProfileByHandle: vi.fn(async () => ({
      xUserId: 'u1',
      handle: 'alice',
      reachScore: 50,
      tier: 'silver',
      founderNumber: 2,
      seasonPoints: 100,
      totalPoints: 100,
      flaggedReason: null,
      revoked: false,
      referralCode: 'alice',
      referralUrl: 'https://crewpay.dev/ref/alice',
      hallOfFame: [],
    })),
    seasonRankForHandle: vi.fn(async () => 3),
    referralCountForReferrerCode: vi.fn(async () => 4),
    taskPointsToday: vi.fn(async () => 0),
    creditProgramPointsCapped: vi.fn(async () => ({
      credited: 0,
      capped: false,
      usedToday: 0,
      cap: 5000,
    })),
  }
})

vi.mock('../lib/kol-program/public-card.js', () => ({
  buildPublicKolCard: vi.fn(async (handle: string) => ({
    handle: handle.replace(/^@+/, ''),
    claimed: false,
    unclaimed: true,
    displayName: handle,
    avatarUrl: null,
    reachScore: 0,
    tier: 'bronze',
    rank: null,
    founderNumber: null,
    referralUrl: `https://crewpay.dev/ref/${handle}`,
    cardUrl: `https://crewpay.dev/api/kol-program/card/${handle}.png`,
    profileUrl: `https://crewpay.dev/kol/${handle}`,
    scoreBars: [],
    lookupOk: false,
    xVerified: false,
    followers: null,
  })),
}))

vi.mock('../lib/kol-program/treasury-pool.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/kol-program/treasury-pool.js')>()
  return {
    ...actual,
    seasonBounds: vi.fn(async () => ({
      start: new Date('2026-10-01T00:00:00Z'),
      end: new Date('2026-11-01T00:00:00Z'),
    })),
  }
})

describe('kol-program routes on mounted API app', () => {
  const prev = process.env.KOL_PROGRAM_ENABLED

  beforeEach(() => {
    process.env.KOL_PROGRAM_ENABLED = '1'
  })

  afterEach(() => {
    process.env.KOL_PROGRAM_ENABLED = prev
    resetSiteIndexCacheForTests()
    vi.unstubAllGlobals()
  })

  it('GET /api/kol-program/hub is registered (not Express 404)', async () => {
    const app = createApiApp()
    const res = await request(app).get('/api/kol-program/hub')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.memberCount).toBe(7)
    expect(res.body.recentJoiners).toHaveLength(1)
    expect(res.body.rows).toHaveLength(1)
    expect(res.body.rows[0].handle).toBe('alice')
    expect(res.body.seasonId).toBe('season_test')
  })

  it('GET /api/kol-program/status stays on the same mount', async () => {
    const app = createApiApp()
    const res = await request(app).get('/api/kol-program/status')
    expect(res.status).toBe(200)
    expect(res.body.enabled).toBe(true)
  })

  it('GET /api/kol-program/public/:handle returns card json', async () => {
    const app = await createApiApp()
    const res = await request(app).get('/api/kol-program/public/strangerhandle')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.card?.handle).toBeTruthy()
  })

  it('GET /api/kol-program/me includes rank and referralCount when session present', async () => {
    const app = createApiApp()
    const res = await request(app).get('/api/kol-program/me').set('Cookie', 'crew_kol_sess=test')
    expect(res.status).toBe(200)
    expect(res.body.profile.rank).toBe(3)
    expect(res.body.profile.referralCount).toBe(4)
  })

  it('GET /kol/:handle and /ref/:handle return per-handle OG HTML', async () => {
    const spa = `<!doctype html><html><head><title>CREW</title>
      <meta property="og:image" content="https://crewpay.dev/brand/banner-og.jpg" />
      <meta name="twitter:card" content="summary_large_image" />
      </head><body><div id="root"></div></body></html>`
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(spa, { status: 200, headers: { 'content-type': 'text/html' } })),
    )
    const app = createApiApp()
    const kol = await request(app).get('/kol/VitalikButerin').set('User-Agent', 'Twitterbot')
    expect(kol.status).toBe(200)
    expect(kol.headers['content-type']).toMatch(/html/)
    expect(kol.text).toContain('api.crewpay.dev/api/kol-program/card/VitalikButerin.png')
    expect(kol.text).toContain('twitter:card')
    expect(kol.text).toContain('id="root"')
    const ref = await request(app).get('/ref/VitalikButerin')
    expect(ref.status).toBe(200)
    expect(ref.text).toContain('https://crewpay.dev/ref/VitalikButerin')
    expect(ref.text).toContain('card/VitalikButerin.png')
    vi.unstubAllGlobals()
  })

  it('GET /kol/:handle rejects invalid handles', async () => {
    const app = createApiApp()
    const res = await request(app).get('/kol/not%20a%20handle!')
    expect(res.status).toBe(404)
  })

  it('GET /kol/tasks serves the SPA shell, not an @tasks card', async () => {
    const spa = `<!doctype html><html><head><title>CREW</title></head><body><div id="root"></div></body></html>`
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(spa, { status: 200, headers: { 'content-type': 'text/html' } })),
    )
    const app = createApiApp()
    const res = await request(app).get('/kol/tasks')
    expect(res.status).toBe(200)
    expect(res.text).toContain('id="root"')
    expect(res.text).not.toContain('@tasks')
    expect(res.text).not.toContain('card/tasks.png')
  })

  it('GET /api/kol-program/public/tasks is reserved', async () => {
    const app = createApiApp()
    const res = await request(app).get('/api/kol-program/public/tasks')
    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
  })

  it('GET /api/kol-program/onboarding signed-out returns locked catalog and 5000 cap', async () => {
    const { readKolSessionCookie } = await import('../lib/kol-session.js')
    vi.mocked(readKolSessionCookie).mockReturnValueOnce(null)
    const app = createApiApp()
    const res = await request(app).get('/api/kol-program/onboarding')
    expect(res.status).toBe(200)
    expect(res.body.signedIn).toBe(false)
    expect(res.body.pointsCap).toBe(5000)
    expect(res.body.pointsToday).toBe(0)
    expect(res.body.steps[0].id).toBe('connect_x')
    expect(res.body.steps[0].unlocked).toBe(true)
    expect(res.body.steps[1].unlocked).toBe(false)
  })
})
