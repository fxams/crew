import { describe, expect, it } from 'vitest'
import { buildSharePageMeta, renderShareHtml } from './share-html.js'

describe('share-html', () => {
  it('includes twitter card and og image png', () => {
    const meta = buildSharePageMeta({
      handle: 'alice',
      kind: 'kol',
      siteUrl: 'https://crewpay.dev',
      apiUrl: 'https://api.crewpay.dev',
      card: {
        handle: 'alice',
        claimed: false,
        unclaimed: true,
        displayName: 'Alice',
        avatarUrl: null,
        reachScore: 42,
        tier: 'silver',
        rank: null,
        founderNumber: null,
        referralUrl: 'https://crewpay.dev/ref/alice',
        cardUrl: 'https://api.crewpay.dev/api/kol-program/card/alice.png',
        profileUrl: 'https://crewpay.dev/kol/alice',
        scoreBars: [],
        lookupOk: true,
        xVerified: false,
        followers: 1000,
      },
    })
    const html = renderShareHtml(meta)
    expect(html).toContain('twitter:card')
    expect(html).toContain('summary_large_image')
    expect(html).toContain('og:image')
    expect(html).toContain('card/alice.png')
    expect(html).toContain('image/png')
  })
})
