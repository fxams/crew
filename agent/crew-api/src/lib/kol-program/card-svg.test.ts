import { describe, expect, it } from 'vitest'
import { renderKolCardSvg } from './card-svg.js'

describe('renderKolCardSvg', () => {
  it('renders 1200x630 OG dimensions', () => {
    const svg = renderKolCardSvg({
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      reachScore: 42,
      notionalInfluenceValueUsd: 2357,
      tier: 'silver',
      founderNumber: 7,
      referralUrl: 'https://crewpay.dev/ref/alice',
      rank: 3,
      scoreBars: [
        { label: 'Followers', value: 10 },
        { label: 'Reach', value: 8 },
      ],
    })
    expect(svg).toContain('width="1200" height="630"')
    expect(svg).toContain('GLOBAL RANK #3')
    expect(svg).toContain('NOTIONAL INFLUENCE VALUE')
    expect(svg).toContain('$2,357')
    expect(svg).toContain('REACH SCORE 42')
  })

  it('marks unclaimed cards', () => {
    const svg = renderKolCardSvg({
      handle: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
      reachScore: 0,
      notionalInfluenceValueUsd: 0,
      tier: 'bronze',
      founderNumber: null,
      referralUrl: 'https://crewpay.dev/ref/bob',
      unclaimed: true,
    })
    expect(svg).toContain('CLAIM YOUR CARD')
  })
})
