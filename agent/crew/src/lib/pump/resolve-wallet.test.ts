import { describe, expect, it, vi } from 'vitest'
import { bareHandle, linkLabel, resolveHandleWallet, type WalletResolveOk } from './resolve-wallet'

describe('bareHandle', () => {
  it('strips @ and lowercases', () => {
    expect(bareHandle('@Bonk_Inu')).toBe('bonk_inu')
  })

  it('rejects invalid handles', () => {
    expect(bareHandle('')).toBeNull()
    expect(bareHandle('@')).toBeNull()
    expect(bareHandle('no spaces')).toBeNull()
    expect(bareHandle('search')).toBeNull()
  })
})

describe('resolveHandleWallet', () => {
  it('maps Pump profile to canonical wallet with x link', async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          address: '9f6Y3vQW8CKfB1iwD7yJEAh2suQWSKdwAgLdYyyXoUTY',
          canonical_svm_wallet: '9f6Y3vQW8CKfB1iwD7yJEAh2suQWSKdwAgLdYyyXoUTY',
          username: 'bonk_inu',
          x_username: 'bonk_inu',
          is_banned: false,
        }),
        { status: 200 },
      ),
    )
    const out = await resolveHandleWallet('@bonk_inu', { fetcher: fetcher as unknown as typeof fetch })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.wallet).toBe('9f6Y3vQW8CKfB1iwD7yJEAh2suQWSKdwAgLdYyyXoUTY')
    expect(out.xVerified).toBe(true)
    expect(out.kind).toBe('x_linked')
    expect(linkLabel(out)).toMatch(/X linked/)
  })

  it('treats pump username match without x as pump_username', async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          address: 'GcUKG8xWHqMck1yiBULYNjJXLfUKZ364HFLuWCkm8xW',
          canonical_svm_wallet: 'GcUKG8xWHqMck1yiBULYNjJXLfUKZ364HFLuWCkm8xW',
          username: 'solana',
          x_username: null,
          is_banned: false,
        }),
        { status: 200 },
      ),
    )
    const out = await resolveHandleWallet('solana', { fetcher: fetcher as unknown as typeof fetch })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.kind).toBe('pump_username')
    expect(out.xVerified).toBe(false)
  })

  it('returns not-found on 404', async () => {
    const fetcher = vi.fn(async () => new Response('User not found', { status: 404 }))
    const out = await resolveHandleWallet('@nobody_here_zz', {
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.error).toMatch(/No Pump profile/)
  })

  it('recovers wallet from truncated jina-style body', async () => {
    const truncated =
      'Markdown Content:\n{"address":"GcUKG8xWHqMck1yiBULYNjJXLfUKZ364HFLuWCkm8xW","username":"solana","x_username":null,"is_banned":false,"last_username_update_time'
    const fetcher = vi.fn(async (url: string) => {
      if (String(url).startsWith('https://frontend-api-v3.pump.fun/')) {
        return new Response('forbidden', { status: 403 })
      }
      if (String(url).includes('r.jina.ai')) {
        return new Response(truncated, { status: 200 })
      }
      return new Response('fail', { status: 500 })
    })
    const out = await resolveHandleWallet('@solana', { fetcher: fetcher as unknown as typeof fetch })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.wallet).toBe('GcUKG8xWHqMck1yiBULYNjJXLfUKZ364HFLuWCkm8xW')
    expect(out.pumpUsername).toBe('solana')
  })

  it('parses allorigins get wrapper', async () => {
    const inner = {
      address: '9f6Y3vQW8CKfB1iwD7yJEAh2suQWSKdwAgLdYyyXoUTY',
      canonical_svm_wallet: '9f6Y3vQW8CKfB1iwD7yJEAh2suQWSKdwAgLdYyyXoUTY',
      username: 'bonk_inu',
      x_username: null,
      is_banned: false,
    }
    const fetcher = vi.fn(async (url: string) => {
      const href = String(url)
      // Direct Pump call is CORS-blocked; proxy carries the same host in ?url=
      if (href.startsWith('https://frontend-api-v3.pump.fun/')) {
        return new Response(JSON.stringify({ statusCode: 403, message: 'Not allowed by CORS' }), {
          status: 403,
        })
      }
      return new Response(
        JSON.stringify({ contents: JSON.stringify(inner), status: { http_code: 200 } }),
        { status: 200 },
      )
    })
    const out = await resolveHandleWallet('@bonk_inu', { fetcher: fetcher as unknown as typeof fetch })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect((out as WalletResolveOk).wallet).toBe(inner.address)
  })
})
