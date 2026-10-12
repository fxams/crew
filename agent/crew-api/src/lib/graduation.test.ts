import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const emitWebhookEvent = vi.fn(async () => {})

vi.mock('./db.js', () => ({
  query: (...args: unknown[]) => query(...args),
}))
vi.mock('./webhooks.js', () => ({
  emitWebhookEvent: (...args: unknown[]) => emitWebhookEvent(...args),
}))

import type { ApiCoin } from './coins.js'
import { detectGraduation, recordGraduationIfNew } from './graduation.js'

const mint = 'So11111111111111111111111111111111111111112'

function coin(over: Partial<ApiCoin> = {}): ApiCoin {
  return {
    id: 'owl',
    mint,
    name: 'Night Owl',
    ticker: 'HOOT',
    vibe: '',
    mode: 'agent',
    crew: [],
    signature: 'sig',
    launchedAt: 1,
    launcher: 'L',
    pumpUrl: `https://pump.fun/coin/${mint}`,
    platform: 'pumpfun',
    ...over,
  }
}

describe('graduation detection', () => {
  it('marks Pump.fun complete / pumpswap / raydium from real fields only', () => {
    expect(detectGraduation({ platform: 'pumpfun', pump: { complete: true } })).toEqual({
      graduated: true,
      via: 'pump-complete',
    })
    expect(detectGraduation({ platform: 'pumpfun', dexId: 'pumpswap' }).via).toBe('pumpswap')
    expect(detectGraduation({ platform: 'pumpfun', pump: { raydium_pool: 'Pool111' } }).via).toBe(
      'raydium',
    )
  })

  it('does not invent graduation on the bonding curve or other venues', () => {
    expect(detectGraduation({ platform: 'pumpfun', dexId: 'pumpfun' })).toEqual({
      graduated: false,
      via: null,
    })
    expect(detectGraduation({ platform: 'bags', pump: { complete: true } }).graduated).toBe(false)
    expect(detectGraduation({ platform: 'zora' }).graduated).toBe(false)
  })
})

describe('recordGraduationIfNew', () => {
  beforeEach(() => {
    query.mockReset()
    emitWebhookEvent.mockReset()
  })

  it('persists once and emits coin.graduated — never tweets', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] })
    const out = await recordGraduationIfNew(coin(), { graduated: true, via: 'pumpswap' })
    expect(out.first).toBe(true)
    expect(out.via).toBe('pumpswap')
    expect(out.graduatedAt).toEqual(expect.any(Number))
    expect(query.mock.calls[0]?.[1]?.[1]).toBe(out.graduatedAt)
    expect(emitWebhookEvent).toHaveBeenCalledWith(
      'coin.graduated',
      expect.objectContaining({
        mint,
        ticker: 'HOOT',
        featured: false,
        via: 'pumpswap',
        note: expect.stringMatching(/does not auto-post/),
      }),
    )
    const payload = JSON.stringify(emitWebhookEvent.mock.calls)
    expect(payload).not.toMatch(/statuses\/update|twitter\.com\/i\/tweet/)
  })

  it('does not re-emit when already marked graduated', async () => {
    const out = await recordGraduationIfNew(coin({ graduatedAt: 99, graduatedVia: 'raydium' }), {
      graduated: true,
      via: 'pumpswap',
    })
    expect(out).toEqual({ first: false, graduatedAt: 99, via: 'raydium' })
    expect(query).not.toHaveBeenCalled()
    expect(emitWebhookEvent).not.toHaveBeenCalled()
  })

  it('does not emit when another writer already persisted', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] })
    const out = await recordGraduationIfNew(coin(), { graduated: true, via: 'pumpswap' })
    expect(out.first).toBe(false)
    expect(emitWebhookEvent).not.toHaveBeenCalled()
  })
})
