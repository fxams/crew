import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApiApp } from '../api-app.js'

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
  }
})

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
  })

  it('GET /api/kol-program/hub is registered (not Express 404)', async () => {
    const app = createApiApp()
    const res = await request(app).get('/api/kol-program/hub')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.memberCount).toBe(7)
    expect(res.body.recentJoiners).toHaveLength(1)
    expect(res.body.seasonId).toBe('season_test')
  })

  it('GET /api/kol-program/status stays on the same mount', async () => {
    const app = createApiApp()
    const res = await request(app).get('/api/kol-program/status')
    expect(res.status).toBe(200)
    expect(res.body.enabled).toBe(true)
  })

  it('GET /api/kol-program/me includes rank and referralCount when session present', async () => {
    const app = createApiApp()
    const res = await request(app).get('/api/kol-program/me').set('Cookie', 'crew_kol_sess=test')
    expect(res.status).toBe(200)
    expect(res.body.profile.rank).toBe(3)
    expect(res.body.profile.referralCount).toBe(4)
  })
})
