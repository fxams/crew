import { afterEach, describe, expect, it } from 'vitest'
import { fxTtlMs, getFxRates, peekFx, resetFxCache, seedFx, setFxFetch } from './fx.js'

describe('fx feed', () => {
  afterEach(() => {
    resetFxCache()
    setFxFetch(null)
    delete process.env.CREW_SOL_USD
    delete process.env.CREW_ETH_USD
    delete process.env.KICKOFF_FX_TTL_MS
  })

  it('uses env overrides without hitting the network', async () => {
    process.env.CREW_SOL_USD = '142.5'
    process.env.CREW_ETH_USD = '3200'
    const fx = await getFxRates()
    expect(fx.solUsd).toBe(142.5)
    expect(fx.ethUsd).toBe(3200)
    expect(fx.source).toBe('env')
  })

  it('caches Dexscreener quotes within TTL', async () => {
    let n = 0
    setFxFetch(async (url) => {
      n += 1
      if (url.includes('So111')) {
        return { pairs: [{ priceUsd: '150', liquidity: { usd: 1e9 } }] }
      }
      if (url.toLowerCase().includes('c02aaa')) {
        return { pairs: [{ priceUsd: '3000', liquidity: { usd: 1e9 } }] }
      }
      return { solana: { usd: 1 }, ethereum: { usd: 1 } }
    })
    const a = await getFxRates(1_000)
    const b = await getFxRates(1_000 + 10_000)
    expect(a.solUsd).toBe(150)
    expect(a.ethUsd).toBe(3000)
    expect(['dexscreener', 'mixed']).toContain(a.source)
    expect(b).toEqual(a)
    expect(n).toBeGreaterThan(0)
    const calls = n
    await getFxRates(1_000 + 20_000)
    expect(n).toBe(calls)
  })

  it('clamps TTL to 1–5 minutes', () => {
    process.env.KICKOFF_FX_TTL_MS = '1000'
    expect(fxTtlMs()).toBe(60_000)
    process.env.KICKOFF_FX_TTL_MS = '9999999'
    expect(fxTtlMs()).toBe(300_000)
  })

  it('peek returns seeded cache', () => {
    seedFx({ solUsd: 99, ethUsd: 1, source: 'env' })
    expect(peekFx()?.solUsd).toBe(99)
  })
})
