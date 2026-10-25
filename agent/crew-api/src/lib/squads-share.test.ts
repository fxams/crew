import { afterEach, describe, expect, it } from 'vitest'
import { injectSpaIndexMeta } from './kol-program/share-html.js'
import { squadsProviderNeedle } from './squads-proxy.js'
import {
  buildSquadsActivityShareMeta,
  renderSquadsActivityCardSvg,
  renderSquadsShareHtml,
  squadsActivityCardUrl,
  squadsActivityPageUrl,
} from './squads-share.js'

const host = squadsProviderNeedle()
const OWL = '4ugDhHJ8XDXAeABmrNmGffFaLbJb9BkPyiFGVSV9ocwo'

describe('squads activity share meta', () => {
  it('builds crewpay permalinks and API card images with twitter large image tags', () => {
    const meta = buildSquadsActivityShareMeta({
      siteUrl: 'https://crewpay.dev',
      apiUrl: 'https://api.crewpay.dev',
      squad: 'alpha-1',
      mint: OWL,
      squadName: 'Night Owls',
      symbol: 'OWL',
    })
    expect(meta.pageUrl).toBe(`https://crewpay.dev/squads/activity?squad=alpha-1&mint=${OWL}`)
    expect(meta.imageUrl).toBe(
      `https://api.crewpay.dev/api/squads/activity-card.png?squad=alpha-1&mint=${OWL}`,
    )
    expect(meta.title).toContain('Squad activity')
    expect(meta.title).toContain('Night Owls')
    expect(meta.description.toLowerCase()).not.toContain(host)
    expect(JSON.stringify(meta).toLowerCase()).not.toMatch(/qatar|asia\/qatar|\+03:00|\bjito\b/)

    const html = renderSquadsShareHtml(meta)
    expect(html).toContain('summary_large_image')
    expect(html).toContain(meta.imageUrl.replace(/&/g, '&amp;'))
    expect(html).toContain(meta.pageUrl.replace(/&/g, '&amp;'))
    expect(html.toLowerCase()).not.toContain(host)
    expect(html).not.toMatch(/\bcheat|\bscam|\brug\b|pump and dump|manipulation/i)
  })

  it('injects the same tags into the SPA shell', () => {
    const meta = buildSquadsActivityShareMeta({
      siteUrl: 'https://crewpay.dev',
      apiUrl: 'https://api.crewpay.dev',
      squad: 'alpha-1',
      mint: OWL,
      squadName: 'Night Owls',
      symbol: 'OWL',
    })
    const injected = injectSpaIndexMeta(
      `<!doctype html><html><head><title>old</title><meta name="twitter:card" content="summary" /></head><body><div id="root"></div></body></html>`,
      meta,
    )
    expect(injected).toContain('summary_large_image')
    expect(injected).toContain('og:image')
    expect(injected).toContain(meta.imageUrl.replace(/&/g, '&amp;'))
  })

  it('keeps helper URLs on CrewPay hosts only', () => {
    expect(
      squadsActivityPageUrl({ siteUrl: 'https://crewpay.dev', squad: 'alpha-1', mint: OWL }),
    ).toMatch(/^https:\/\/crewpay\.dev\/squads\/activity\?/)
    expect(
      squadsActivityCardUrl({ apiUrl: 'https://api.crewpay.dev', squad: 'alpha-1', mint: OWL }),
    ).toMatch(/^https:\/\/api\.crewpay\.dev\/api\/squads\/activity-card\.png\?/)
  })
})

describe('squads activity card svg', () => {
  it('renders a dark card without provider copy', () => {
    const svg = renderSquadsActivityCardSvg({
      squadName: 'Night Owls',
      symbol: 'OWL',
      bundles: 2,
      bundledBuy: 6.6,
      bundledSell: 1.2,
    })
    expect(svg).toContain('#0b0f17')
    expect(svg).toContain('Squad activity')
    expect(svg).toContain('Night Owls')
    expect(svg.toLowerCase()).not.toContain(host)
    expect(svg.toLowerCase()).not.toMatch(/jito|qatar|cheat|scam|rug/)
  })
})

afterEach(() => {
  /* keep isolated */
})
