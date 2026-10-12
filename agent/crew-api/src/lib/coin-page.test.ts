import { afterEach, describe, expect, it } from 'vitest'
import {
  chunkMints,
  coinPageUrl,
  DEX_TOKEN_BATCH,
  dexTokensV1Url,
  enrichPublicCoinMetas,
  mergePublicCoinMeta,
  normalizePublicCoinMeta,
  parseDexTokenQuotes,
  parsePumpCoinMeta,
  pumpCurveMarketCapUsd,
  resetCoinMetaCache,
  setCoinMetaFetch,
  toPublicCoinPage,
} from './coin-page.js'
import { resetFxCache, seedFx } from './fx.js'
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

describe('Dexscreener tokens/v1 quotes', () => {
  const mint = coin.mint

  it('batches up to 30 mints on /tokens/v1/{chain}/{mints}', () => {
    const mints = Array.from({ length: 31 }, (_, i) => `Mint${i.toString().padStart(2, '0')}xxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
    expect(chunkMints(mints)).toHaveLength(2)
    expect(chunkMints(mints)[0]).toHaveLength(DEX_TOKEN_BATCH)
    const url = dexTokensV1Url('solana', [mint, 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'])
    expect(url).toBe(
      `https://api.dexscreener.com/tokens/v1/solana/${mint},DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`,
    )
  })

  it('reads market cap, 24h change, and image from a tokens/v1 array', () => {
    const meta = parseDexTokenQuotes(
      [
        {
          chainId: 'solana',
          dexId: 'pumpswap',
          baseToken: { address: mint, symbol: 'HOOT' },
          marketCap: 12_400,
          fdv: 12_400,
          priceChange: { h24: 4.2 },
          volume: { h24: 800 },
          info: { imageUrl: 'https://cdn.dexscreener.com/hoot.png' },
        },
        {
          chainId: 'solana',
          dexId: 'raydium',
          baseToken: { address: mint, symbol: 'HOOT' },
          marketCap: 9_000,
          priceChange: { h24: 1 },
        },
      ],
      mint,
    )
    expect(meta.marketCapUsd).toBe(12_400)
    expect(meta.priceChange24h).toBe(4.2)
    expect(meta.imageUrl).toBe('https://cdn.dexscreener.com/hoot.png')
    expect(meta.graduatedVia).toBe('pumpswap')
  })

  it('still parses the legacy { pairs } envelope', () => {
    const meta = parseDexTokenQuotes({
      pairs: [
        {
          baseToken: { address: mint },
          marketCap: 2_200,
          priceChange: { h24: -1.5 },
        },
      ],
    }, mint)
    expect(meta.marketCapUsd).toBe(2_200)
    expect(meta.priceChange24h).toBe(-1.5)
  })

  it('does not invent a quote when Dexscreener returns no pairs', () => {
    expect(parseDexTokenQuotes([], mint)).toEqual({})
    expect(parseDexTokenQuotes({ pairs: [] }, mint).marketCapUsd).toBeUndefined()
  })
})

describe('Pump bonding-curve fallback', () => {
  it('prefers usd_market_cap from launch metadata', () => {
    const meta = parsePumpCoinMeta({
      image_uri: 'https://ipfs.io/ipfs/bafyhoot',
      usd_market_cap: 3_333,
      virtual_sol_reserves: 30e9,
      virtual_token_reserves: 1_073_000_000 * 1e6,
    })
    expect(meta.marketCapUsd).toBe(3_333)
    expect(meta.imageUrl).toMatch(/^https:\/\/ipfs\.io\//)
  })

  it('computes curve mcap from virtual reserves × SOL/USD when usd_market_cap is missing', () => {
    const o = {
      virtual_sol_reserves: 30e9,
      virtual_token_reserves: 1_073_000_000 * 1e6,
    }
    const mcap = pumpCurveMarketCapUsd(o, 150)
    expect(mcap).toBeGreaterThan(4_000)
    expect(mcap).toBeLessThan(5_000)
    expect(pumpCurveMarketCapUsd(o, null)).toBeUndefined()
    expect(parsePumpCoinMeta(o, { solUsd: 150 }).marketCapUsd).toBe(mcap)
  })
})

describe('merge launch image over Dexscreener quotes', () => {
  it('keeps launch metadata image and Dexscreener market cap', () => {
    const merged = mergePublicCoinMeta(
      { imageUrl: 'https://ipfs.io/ipfs/launch', marketCapUsd: 111 },
      { imageUrl: 'https://cdn.dexscreener.com/dex.png', marketCapUsd: 9_999, priceChange24h: 2 },
    )
    expect(merged.imageUrl).toBe('https://ipfs.io/ipfs/launch')
    expect(merged.marketCapUsd).toBe(9_999)
    expect(merged.priceChange24h).toBe(2)
  })

  it('falls back to Dexscreener image and Pump mcap when the other side is empty', () => {
    const merged = mergePublicCoinMeta(
      { marketCapUsd: 420 },
      { imageUrl: 'https://cdn.dexscreener.com/dex.png' },
    )
    expect(merged.imageUrl).toBe('https://cdn.dexscreener.com/dex.png')
    expect(merged.marketCapUsd).toBe(420)
  })
})

describe('enrichPublicCoinMetas', () => {
  afterEach(() => {
    resetCoinMetaCache()
    resetFxCache()
    setCoinMetaFetch(null)
  })

  it('batches Dexscreener and uses Pump when a mint has no pair', async () => {
    seedFx({ solUsd: 150 })
    const listed: string[] = []
    setCoinMetaFetch(async (url) => {
      listed.push(url)
      if (url.includes('/tokens/v1/solana/')) {
        expect(url).toContain(coin.mint)
        return []
      }
      if (url.includes('frontend-api-v3.pump.fun/coins/')) {
        return {
          image_uri: 'https://ipfs.io/ipfs/bafyhoot',
          usd_market_cap: 5_500,
        }
      }
      return null
    })
    const map = await enrichPublicCoinMetas([coin])
    const meta = map.get(coin.mint)
    expect(meta?.marketCapUsd).toBe(5_500)
    expect(meta?.imageUrl).toMatch(/ipfs/)
    expect(listed.some((u) => u.includes('/tokens/v1/solana/'))).toBe(true)
    expect(listed.some((u) => u.includes('frontend-api-v3.pump.fun'))).toBe(true)
  })
})
