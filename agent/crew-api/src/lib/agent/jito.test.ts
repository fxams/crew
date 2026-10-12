import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  JITO_DEFAULT_ENGINES,
  jitoBackoffMs,
  jitoBundleUrls,
  jitoRpc,
  jitoSendBundleBroadcast,
  jitoTipLamports,
  probeJitoEngines,
} from './jito.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.CREW_JITO_BUNDLE_URL
  delete process.env.CREW_JITO_TIP_LAMPORTS
  delete process.env.CREW_JITO_TIMEOUT_MS
})

describe('jito engines and tips', () => {
  it('lists mainnet + amsterdam + frankfurt + ny + tokyo', () => {
    const urls = jitoBundleUrls()
    expect(urls).toEqual([...JITO_DEFAULT_ENGINES])
    expect(urls.some((u) => u.includes('amsterdam'))).toBe(true)
    expect(urls.some((u) => u.includes('frankfurt'))).toBe(true)
    expect(urls.some((u) => u.includes('ny.mainnet'))).toBe(true)
    expect(urls.some((u) => u.includes('tokyo'))).toBe(true)
  })

  it('prepends CREW_JITO_BUNDLE_URL without duplicating', () => {
    process.env.CREW_JITO_BUNDLE_URL = JITO_DEFAULT_ENGINES[0]
    expect(jitoBundleUrls()[0]).toBe(JITO_DEFAULT_ENGINES[0])
    expect(jitoBundleUrls().filter((u) => u === JITO_DEFAULT_ENGINES[0])).toHaveLength(1)
  })

  it('scales tip across attempts and caps at 0.01 SOL', () => {
    expect(jitoTipLamports(1_000_000, 1)).toBe(1_000_000)
    expect(jitoTipLamports(1_000_000, 2)).toBe(1_500_000)
    expect(jitoTipLamports(1_000_000, 3)).toBe(2_000_000)
    expect(jitoTipLamports(8_000_000, 4)).toBe(10_000_000)
    expect(jitoBackoffMs(1)).toBe(500)
    expect(jitoBackoffMs(2)).toBe(1_000)
    expect(jitoBackoffMs(3)).toBe(2_000)
  })
})

describe('jitoRpc timeout and broadcast retry', () => {
  it('times out hung engines', async () => {
    process.env.CREW_JITO_TIMEOUT_MS = '120'
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_, reject) => {
          const signal = init?.signal
          if (signal) {
            signal.addEventListener('abort', () => {
              const err = new Error('aborted')
              err.name = 'AbortError'
              reject(err)
            })
          }
        })
      }),
    )
    await expect(jitoRpc('https://example.invalid/bundles', 'getTipAccounts', [])).rejects.toThrow(
      /timeout/,
    )
  })

  it('retries sendBundle sequentially after parallel failures', async () => {
    process.env.CREW_JITO_BUNDLE_URL = 'https://custom.jito.test/bundles'
    process.env.CREW_JITO_TIMEOUT_MS = '200'
    let customHits = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const href = String(url)
        const body = JSON.parse(String(init?.body || '{}')) as { method?: string }
        if (body.method !== 'sendBundle') {
          return new Response(JSON.stringify({ result: [] }), { status: 200 })
        }
        if (href.includes('custom.jito.test')) {
          customHits += 1
          if (customHits >= 2) {
            return new Response(JSON.stringify({ result: 'bundle-ok' }), { status: 200 })
          }
        }
        return new Response(JSON.stringify({ error: { message: 'unavailable' } }), { status: 200 })
      }),
    )

    const out = await jitoSendBundleBroadcast(['dGVzdA=='])
    expect(out.bundleId).toBe('bundle-ok')
    expect(out.urls.some((u) => u.includes('custom.jito.test'))).toBe(true)
    expect(customHits).toBeGreaterThanOrEqual(2)
  })

  it('probeJitoEngines reports partial reachability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const href = String(url)
        if (href.includes('tokyo')) {
          return new Response(JSON.stringify({ result: ['Tip111111111111111111111111111111111111111'] }), {
            status: 200,
          })
        }
        return new Response(JSON.stringify({ error: { message: 'down' } }), { status: 200 })
      }),
    )
    const health = await probeJitoEngines()
    expect(health.ok).toBe(true)
    expect(health.reachable).toBe(1)
    expect(health.engines).toHaveLength(5)
    expect(health.engines.find((e) => e.url.includes('tokyo'))?.ok).toBe(true)
  })
})
