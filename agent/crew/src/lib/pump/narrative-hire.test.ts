import { describe, expect, it } from 'vitest'
import { detectNarratives, planNarrativeHires, splitShares } from './narrative-hire'
import { correlationScore, topKolRecords } from './kol-directory'

describe('detectNarratives', () => {
  it('tags AI launches', () => {
    const m = detectNarratives({
      name: 'Desk Mind',
      ticker: 'AGENT',
      vibe: 'An AI agent that hires KOLs',
    })
    expect(m.tags).toContain('ai')
  })

  it('tags animal memes', () => {
    const m = detectNarratives({
      name: 'Desk Cat',
      ticker: 'DCAT',
      vibe: 'A trading-floor cat tip bot',
    })
    expect(m.tags.some((t) => t === 'animal' || t === 'meme')).toBe(true)
  })
})

describe('planNarrativeHires', () => {
  it('fills crew with wallets totaling 100%', () => {
    const plan = planNarrativeHires(
      { name: 'Trench Frog', ticker: 'FROG', vibe: 'degen trench raid meme' },
      { limit: 3 },
    )
    expect(plan.hires.length).toBe(3)
    expect(plan.crew.every((c) => c.wallet.length >= 32)).toBe(true)
    expect(plan.crew.reduce((s, c) => s + c.share, 0)).toBe(100)
    expect(new Set(plan.crew.map((c) => c.wallet)).size).toBe(3)
    // Prefer real reach — not junk userN profiles
    expect(plan.hires.every((h) => h.kol.followers >= 5_000)).toBe(true)
    expect(plan.hires.every((h) => !/^user\d+$/i.test(h.kol.pump))).toBe(true)
  })

  it('boosts correlated packs', () => {
    expect(correlationScore('slingoor', 'cupsey')).toBeGreaterThan(0.5)
    expect(correlationScore('slingoor', '0xwinged')).toBeLessThan(
      correlationScore('slingoor', 'cooker'),
    )
  })
})

describe('splitShares', () => {
  it('sums to 100 with equal splits', () => {
    for (const n of [1, 2, 3, 4, 5, 10]) {
      const shares = splitShares(n)
      expect(shares.reduce((a, b) => a + b, 0)).toBe(100)
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1)
    }
  })
})

describe('kol db', () => {
  it('has ranked 1500 with correlations and narratives', () => {
    const top = topKolRecords(1500)
    expect(top.length).toBeGreaterThanOrEqual(1500)
    expect(top.every((k) => k.correlated.length > 0)).toBe(true)
    expect(top.every((k) => k.narratives.length > 0)).toBe(true)
    expect(top.every((k) => k.wallet.length >= 32)).toBe(true)
  })
})
