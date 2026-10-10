import { describe, expect, it } from 'vitest'
import { detectNarratives, planNarrativeHires, KOL_DB } from './narrative.js'
import { buildCrewShareholders, normalizeCrew } from './shareholders.js'

describe('agent narrative autohire', () => {
  it('loads kol db', () => {
    expect(KOL_DB.length).toBeGreaterThanOrEqual(1500)
  })

  it('plans a 5-pack with wallets totaling 100%', () => {
    const plan = planNarrativeHires(
      { name: 'Pepe AI', ticker: 'PEPEAI', vibe: 'meme degen frog agent' },
      { limit: 5 },
    )
    expect(plan.hires.length).toBe(5)
    expect(plan.crew.reduce((s, c) => s + c.share, 0)).toBe(100)
    expect(plan.crew.every((c) => c.wallet.length >= 32)).toBe(true)
    expect(plan.match.tags.length).toBeGreaterThan(0)
  })

  it('detects ai ticker', () => {
    const m = detectNarratives({ name: 'Mind', ticker: 'AGENT', vibe: '' })
    expect(m.tags[0]).toBe('ai')
  })

  it('demotes known-bad X @oxrxbt out of hire #1 (CP-3)', () => {
    const plan = planNarrativeHires(
      { name: 'Viral Cat', ticker: 'CAT', vibe: 'a trench meme about a viral cat' },
      { limit: 5 },
    )
    expect(plan.hires.length).toBe(5)
    const top = plan.hires[0]!
    const topX = (top.kol.x || '').toLowerCase().replace(/^@/, '')
    expect(topX).not.toBe('oxrxbt')
    expect(top.kol.pump.toLowerCase()).not.toBe('oxr')
    const oxr = plan.hires.find(
      (h) =>
        (h.kol.x || '').toLowerCase().replace(/^@/, '') === 'oxrxbt' ||
        h.kol.pump.toLowerCase() === 'oxr',
    )
    if (oxr) {
      expect(oxr.reasons.some((r) => /unverified\/weak X/i.test(r))).toBe(true)
      expect(oxr.hireRank).toBeGreaterThan(1)
    }
  })

  it('prefers registered crew wallet when handle matches', () => {
    const baseline = planNarrativeHires(
      { name: 'Meme Coin', ticker: 'MEME', vibe: 'funny viral meme degen' },
      { limit: 5 },
    )
    expect(baseline.hires.length).toBeGreaterThan(0)
    // Register a mid-pack hire so preference + wallet swap are visible.
    const seed = baseline.hires[Math.min(2, baseline.hires.length - 1)]!.kol
    const handle = (seed.x || seed.pump).replace(/^@+/, '').toLowerCase()
    const regWallet = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    const plan = planNarrativeHires(
      { name: 'Meme Coin', ticker: 'MEME', vibe: 'funny viral meme degen' },
      {
        limit: 5,
        registered: [{ handle, wallet: regWallet }],
      },
    )
    const hit = plan.hires.find((h) =>
      h.reasons.some((r) => /registered crew/i.test(r)),
    )
    expect(hit).toBeTruthy()
    expect(hit!.kol.wallet).toBe(regWallet)
    expect(hit!.hireRank).toBe(1)
  })
})

describe('shareholders', () => {
  it('builds 10000 bps with platform cut', () => {
    const platform = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
    const desk = 'SysvarRent111111111111111111111111111111111'
    const crew = normalizeCrew(
      [
        { handle: '@a', wallet: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', share: 60, hireRole: 'kol' },
        { handle: '@b', wallet: 'So11111111111111111111111111111111111111112', share: 40, hireRole: 'caller' },
      ],
      'agent',
    )
    const shares = buildCrewShareholders(crew, 'agent', {
      deskWallet: desk,
      platformWallet: platform,
    })
    expect(shares.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
    expect(shares.find((s) => s.wallet === platform)?.bps).toBe(2500)
    expect(shares.find((s) => s.wallet === desk)?.bps).toBe(1500)
  })
})
