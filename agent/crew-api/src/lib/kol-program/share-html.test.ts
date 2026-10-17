import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildSharePageMeta,
  injectSpaIndexMeta,
  renderKolSharePageHtml,
  renderShareHtml,
  resetSiteIndexCacheForTests,
} from './share-html.js'

const card = {
  handle: 'alice',
  claimed: false,
  unclaimed: true,
  displayName: 'Alice',
  avatarUrl: null,
  reachScore: 42,
  notionalInfluenceValueUsd: 1200,
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
  seasonPoints: 10,
  memberNumber: 3,
}

const meta = buildSharePageMeta({
  handle: 'alice',
  kind: 'kol',
  siteUrl: 'https://crewpay.dev',
  apiUrl: 'https://api.crewpay.dev',
  card,
})

const LIVE_SHAPED_INDEX = `<!doctype html>
<html lang="en">
  <head>
    <title>CREW — Agents hire KOLs. Humans get paid.</title>
    <meta
      name="description"
      content="Production Pump.fun fee desk on Solana mainnet."
    />
    <meta property="og:title" content="CREW — Agents hire. Crew gets paid." />
    <meta
      property="og:description"
      content="Connect a wallet."
    />
    <meta property="og:url" content="https://crewpay.dev/" />
    <meta property="og:image" content="https://crewpay.dev/brand/banner-og.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="CREW — Agents hire. Crew gets paid." />
    <meta
      name="twitter:description"
      content="On-chain Pump.fun fee desk."
    />
    <meta name="twitter:image" content="https://crewpay.dev/brand/banner-og.jpg" />
    <script type="module" crossorigin src="/assets/index-IoKLWJcT.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`

describe('share-html', () => {
  afterEach(() => {
    resetSiteIndexCacheForTests()
    vi.unstubAllGlobals()
  })

  it('includes twitter card and og image png', () => {
    const html = renderShareHtml(meta)
    expect(html).toContain('twitter:card')
    expect(html).toContain('summary_large_image')
    expect(html).toContain('og:image')
    expect(html).toContain('card/alice.png')
    expect(html).toContain('image/png')
  })

  it('injects per-handle OG into the live multiline SPA index and keeps the SPA root', () => {
    const html = injectSpaIndexMeta(LIVE_SHAPED_INDEX, meta)
    expect(html).toContain('<title>@alice · CrewPay KOL</title>')
    expect(html).toContain('content="https://api.crewpay.dev/api/kol-program/card/alice.png"')
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
    expect(html).not.toContain('banner-og.jpg')
    expect(html).toContain('id="root"')
    expect(html).toContain('src="/assets/index-IoKLWJcT.js"')
  })

  it('loads the SPA shell when the site index fetch succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(LIVE_SHAPED_INDEX, { status: 200, headers: { 'content-type': 'text/html' } })),
    )
    const html = await renderKolSharePageHtml(meta, 'https://crewpay.dev')
    expect(html).toContain('id="root"')
    expect(html).toContain('card/alice.png')
    expect(html).toContain('src="/assets/index-IoKLWJcT.js"')
  })

  it('falls back to crawler HTML when the site index is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    const html = await renderKolSharePageHtml(meta, 'https://crewpay.dev')
    expect(html).toContain('card/alice.png')
    expect(html).toContain('Open CrewPay KOL')
    expect(html).not.toContain('id="root"')
  })
})
