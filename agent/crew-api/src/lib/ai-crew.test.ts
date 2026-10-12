import { describe, expect, it, beforeEach } from 'vitest'
import {
  aiCrewMaxPerDay,
  aiCrewPublicNote,
  captionFor,
  ensureAiCrew,
  fitTickerFontSize,
  generateAiCrewItem,
  resetAiCrew,
  svgMeme,
} from './ai-crew.js'

const MINT = 'So11111111111111111111111111111111111111112'

describe('AI crew (free tier)', () => {
  beforeEach(() => {
    resetAiCrew()
    delete process.env.AI_CREW_MAX_PER_DAY
    delete process.env.AI_CREW_MIN_INTERVAL_HOURS
    delete process.env.AI_CREW_ENABLED
  })

  it('builds captions and SVG without secrets or earnings talk', () => {
    const cap = captionFor('HOOT', 'Night Owl', 0)
    expect(cap).toMatch(/\$HOOT/)
    expect(cap.toLowerCase()).not.toMatch(/guaranteed|roi|100x|60%|@crewpay/)
    const svg = svgMeme('HOOT', { imageHref: 'https://api.crewpay.dev/api/coins/x/logo' })
    expect(svg).toContain('<svg')
    expect(svg).toContain('$HOOT')
    expect(svg).toContain('AI CREW')
    expect(svg).not.toContain('foreignObject')
    expect(svg).toContain('/api/coins/x/logo')
    expect(aiCrewPublicNote()).toBe('Lightweight AI memes. Humans stay the core.')
    expect(aiCrewPublicNote().toLowerCase()).not.toMatch(/@crewpay|60%/)
  })

  it('shrinks long tickers so the title stays in the card', () => {
    expect(fitTickerFontSize('HOOT')).toBeGreaterThan(40)
    expect(fitTickerFontSize('MYSTERYCASE')).toBeLessThanOrEqual(40)
    expect(fitTickerFontSize('MYSTERYCASE')).toBeGreaterThanOrEqual(16)
    const svg = svgMeme('MYSTERYCASE')
    const size = Number(svg.match(/font-size="(\d+)" font-weight="700">\$MYSTERYCASE/)?.[1])
    expect(size).toBe(fitTickerFontSize('MYSTERYCASE'))
    expect(svg).toContain('$MYSTERYCASE')
    expect(svg).not.toContain('font-size="56"')
  })

  it('never writes 60% or @crewpay into generated captions', () => {
    for (let salt = 0; salt < 12; salt++) {
      const cap = captionFor('MYSTERYCASE', 'The Mystery Case', salt)
      expect(cap.toLowerCase()).not.toMatch(/60%|get the|@crewpay|earnings/)
    }
  })

  it('caps generations per UTC day', () => {
    process.env.AI_CREW_MAX_PER_DAY = '2'
    process.env.AI_CREW_MIN_INTERVAL_HOURS = '0'
    const a = generateAiCrewItem({ mint: MINT, ticker: 'HOOT', name: 'Night Owl', now: 1 })
    const b = generateAiCrewItem({ mint: MINT, ticker: 'HOOT', name: 'Night Owl', now: 2 })
    const c = generateAiCrewItem({ mint: MINT, ticker: 'HOOT', name: 'Night Owl', now: 3 })
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    expect(c).toBeNull()
    expect(aiCrewMaxPerDay()).toBe(2)
  })

  it('respects min interval', () => {
    process.env.AI_CREW_MIN_INTERVAL_HOURS = '1'
    const t0 = Date.UTC(2026, 0, 1, 0, 0, 0)
    expect(generateAiCrewItem({ mint: MINT, ticker: 'HOOT', name: 'Owl', now: t0 })).toBeTruthy()
    expect(
      generateAiCrewItem({ mint: MINT, ticker: 'HOOT', name: 'Owl', now: t0 + 10 * 60_000 }),
    ).toBeNull()
    expect(
      generateAiCrewItem({ mint: MINT, ticker: 'HOOT', name: 'Owl', now: t0 + 61 * 60_000 }),
    ).toBeTruthy()
  })

  it('ensureAiCrew lists items and stays off when disabled', () => {
    process.env.AI_CREW_ENABLED = 'false'
    expect(ensureAiCrew({ mint: MINT, ticker: 'HOOT', name: 'Owl' })).toEqual([])
    process.env.AI_CREW_ENABLED = 'true'
    process.env.AI_CREW_MIN_INTERVAL_HOURS = '0'
    expect(ensureAiCrew({ mint: MINT, ticker: 'HOOT', name: 'Owl' }).length).toBe(1)
  })
})
