import { describe, expect, it } from 'vitest'
import {
  FALLBACK_X402,
  X402_HREF,
  formatX402Networks,
  normalizeX402,
  pickX402Raw,
  x402FromDoc,
  x402KeyLabel,
  x402LaunchCurl,
  x402PayLabel,
  x402SnippetNote,
} from './x402'

const LIVE_SHAPE = {
  enabled: true,
  asset: 'USDC',
  networks: ['base', 'solana'],
  prices: {
    launch: '$0.10',
    unsigned: '$0.10',
    autohire: '$0.02',
  },
  headers: { request: 'X-PAYMENT', response: 'X-PAYMENT-RESPONSE' },
  alternativeAuth: 'x-crew-api-key',
}

describe('x402 discovery parse', () => {
  it('reads x402 from GET /api/platforms payload', () => {
    const info = x402FromDoc({ ok: true, venues: [], x402: LIVE_SHAPE })
    expect(info.enabled).toBe(true)
    expect(info.prices.launch).toBe('$0.10')
    expect(info.prices.autohire).toBe('$0.02')
    expect(info.networks).toEqual(['base', 'solana'])
    expect(info.asset).toBe('USDC')
    expect(info.requestHeader).toBe('X-PAYMENT')
  })

  it('reads nested platforms.x402 and auth.x402 from discovery', () => {
    expect(pickX402Raw({ platforms: { x402: LIVE_SHAPE } })).toEqual(LIVE_SHAPE)
    expect(x402FromDoc({ auth: { x402: { ...LIVE_SHAPE, prices: { launch: 0.25, autohire: '0.05' } } } }).prices).toEqual({
      launch: '$0.25',
      autohire: '$0.05',
    })
  })

  it('falls back to $0.10 / $0.02 and Base or Solana when missing', () => {
    expect(x402FromDoc(null)).toEqual(FALLBACK_X402)
    expect(x402FromDoc({})).toEqual(FALLBACK_X402)
    const sparse = x402FromDoc({ x402: { enabled: false, networks: [], prices: {} } })
    expect(sparse.enabled).toBe(false)
    expect(sparse.prices).toEqual({ launch: '$0.10', autohire: '$0.02' })
    expect(sparse.networks).toEqual(['base', 'solana'])
  })

  it('ignores junk prices and unknown networks', () => {
    const info = normalizeX402({
      prices: { launch: 'nope', autohire: -1 },
      networks: ['ethereum', 'base', 'base', 'eip155:8453', 'sol', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
      asset: 'usdc',
    })
    expect(info.prices.launch).toBe('$0.10')
    expect(info.prices.autohire).toBe('$0.02')
    expect(info.networks).toEqual(['base', 'solana'])
    expect(info.asset).toBe('USDC')
  })
})

describe('x402 copy', () => {
  it('formats Auth labels from discovery prices/networks', () => {
    expect(x402KeyLabel()).toBe('API key (free)')
    expect(x402PayLabel(FALLBACK_X402)).toBe('x402 pay per call ($0.10 USDC, Base or Solana)')
    expect(formatX402Networks(['base'])).toBe('Base')
    expect(formatX402Networks(['solana'])).toBe('Solana')
    expect(x402PayLabel({ ...FALLBACK_X402, prices: { launch: '$0.25', autohire: '$0.02' }, networks: ['base'] })).toBe(
      'x402 pay per call ($0.25 USDC, Base)',
    )
  })

  it('snippet has X-PAYMENT, no API key, and no earnings promise', () => {
    const curl = x402LaunchCurl(FALLBACK_X402)
    expect(curl).toContain('X-PAYMENT: $X402_PAYMENT')
    expect(curl).toContain('/api/agent/launch/unsigned')
    expect(curl.toLowerCase()).not.toContain('x-crew-api-key')
    expect(x402SnippetNote(FALLBACK_X402)).toMatch(/402/)
    expect(x402SnippetNote(FALLBACK_X402)).toContain('X-PAYMENT')
    expect(x402SnippetNote(FALLBACK_X402).toLowerCase()).not.toMatch(/earnings|you will make|guaranteed/)
    expect(X402_HREF).toBe('https://x402.org')
  })
})
