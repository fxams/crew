import { describe, expect, it } from 'vitest'
import {
  coinPageUrl,
  normalizePublicCoinMeta,
  toPublicCoinPage,
} from './coin-page.js'
import type { ApiCoin } from './coins.js'

const coin: ApiCoin = {
  id: 'c1',
  mint: 'So11111111111111111111111111111111111111112',
  name: 'Night Owl',
  ticker: 'HOOT',
  vibe: 'owl meme',
  mode: 'agent',
  crew: [{ handle: 'owl', wallet: 'OwlWallet11111111111111111111111111111111', share: 60 }],
  signature: 'sig',
  launchedAt: 1_700_000_000_000,
  launcher: 'LaunchWallet11111111111111111111111111111',
  pumpUrl: 'https://pump.fun/coin/So11111111111111111111111111111111111111112',
  platform: 'pumpfun',
}

describe('public coin page DTO', () => {
  it('builds crewpay.dev/coin/<mint> from launch records', () => {
    const page = toPublicCoinPage(coin)
    expect(page.pageUrl).toBe(coinPageUrl(coin.mint))
    expect(page.pageUrl).toBe(`https://crewpay.dev/coin/${coin.mint}`)
    expect(page.name).toBe('Night Owl')
    expect(page.ticker).toBe('HOOT')
    expect(page.crew[0]?.handle).toBe('owl')
    expect(page.launchpadLabel).toBe('Pump.fun')
    expect(page.chain).toBe('solana')
  })

  it('tucks socials only when they are public https', () => {
    const meta = normalizePublicCoinMeta({
      imageUrl: 'https://ipfs.io/ipfs/bafy',
      twitter: '@CrewPayHQ',
      website: 'https://crewpay.dev',
      telegram: 'javascript:alert(1)',
    })
    expect(meta.imageUrl).toMatch(/^https:/)
    expect(meta.twitter).toBe('https://x.com/CrewPayHQ')
    expect(meta.website).toBe('https://crewpay.dev/')
    expect(meta.telegram).toBeUndefined()
  })

  it('drops private / unsafe image hosts', () => {
    const meta = normalizePublicCoinMeta({
      imageUrl: 'http://127.0.0.1/x.png',
      twitter: 'not a handle!!!',
    })
    expect(meta.imageUrl).toBeUndefined()
    expect(meta.twitter).toBeUndefined()
  })

  it('never claims launcher gets 60%', () => {
    const page = toPublicCoinPage(coin)
    expect(JSON.stringify(page).toLowerCase()).not.toMatch(/launcher gets 60/)
  })
})
