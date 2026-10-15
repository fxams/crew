import { afterEach, describe, expect, it, vi } from 'vitest'
import { cfgCanX402Pay, crewFetch, loadConfig, resolvePublicMode } from './client.js'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('resolvePublicMode', () => {
  it('honors explicit override', () => {
    expect(resolvePublicMode(true)).toBe(true)
    expect(resolvePublicMode(false)).toBe(false)
  })

  it('defaults stdio / unset to private', () => {
    vi.stubEnv('CREW_MCP_PUBLIC', '')
    expect(resolvePublicMode()).toBe(false)
  })

  it('respects CREW_MCP_PUBLIC=0', () => {
    vi.stubEnv('CREW_MCP_PUBLIC', '0')
    expect(resolvePublicMode()).toBe(false)
  })

  it('respects CREW_MCP_PUBLIC=1', () => {
    vi.stubEnv('CREW_MCP_PUBLIC', '1')
    expect(resolvePublicMode()).toBe(true)
  })
})

describe('loadConfig publicMode', () => {
  it('ignores shared env API key in public mode', () => {
    vi.stubEnv('CREW_MCP_PUBLIC', '1')
    vi.stubEnv('CREW_AGENT_API_KEY', 'shared-secret')
    vi.stubEnv('CREW_LAUNCHER_KEY', 'launcher-secret')
    vi.stubEnv('X402_EVM_PRIVATE_KEY', `0x${'ab'.repeat(32)}`)
    const cfg = loadConfig()
    expect(cfg.publicMode).toBe(true)
    expect(cfg.apiKey).toBe('')
    expect(cfg.launcherKey).toBe('')
    expect(cfg.x402EvmPrivateKey).toBe('')
  })
})

describe('crewFetch x402', () => {
  it('retries a 402 with X-PAYMENT when a payer is configured', async () => {
    const calls: { url: string; payment?: string | null }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers)
        const payment = headers.get('X-PAYMENT')
        calls.push({ url: String(url), payment })
        if (!payment) {
          return new Response(
            JSON.stringify({
              x402Version: 2,
              error: 'Payment Required',
              accepts: [{ scheme: 'exact', network: 'eip155:8453', amount: '100000', payTo: '0x11' }],
            }),
            { status: 402, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ ok: true, paid: true }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'X-PAYMENT-RESPONSE': 'abc' },
        })
      }),
    )
    const cfg = loadConfig({
      apiUrl: 'https://api.crewpay.dev',
      publicMode: false,
      apiKey: '',
      x402Pay: async () => 'signed-payment-b64',
    })
    expect(cfgCanX402Pay(cfg)).toBe(true)
    const json = await crewFetch(cfg, '/api/agent/launch/unsigned', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ name: 'Desk Cat' }),
    })
    expect(json).toEqual({ ok: true, paid: true })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.payment).toBeNull()
    expect(calls[1]?.payment).toBe('signed-payment-b64')
  })

  it('still uses an API key without paying', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers)
        expect(headers.get('x-crew-api-key')).toBe('crew_ak_test')
        expect(headers.get('X-PAYMENT')).toBeNull()
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    const json = await crewFetch(
      loadConfig({ apiUrl: 'https://api.crewpay.dev', apiKey: 'crew_ak_test', publicMode: false }),
      '/api/agent/autohire',
      { method: 'POST', auth: true, body: '{}' },
    )
    expect(json).toEqual({ ok: true })
  })
})
