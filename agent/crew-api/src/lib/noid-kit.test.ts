import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NOID_KIT_TOOLS,
  NOID_PUBLIC_NOTE,
  listNoidTools,
  noidKitConnectSnippet,
  noidKitEnabled,
  noidKitUrls,
  noidPublicJson,
  parseMcpRpcBody,
  parseNoidToolResult,
  proxyNoidRead,
  resetNoidKitForTests,
} from './noid-kit.js'

describe('noid-kit client', () => {
  const prev = {
    NOID_KIT_ENABLED: process.env.NOID_KIT_ENABLED,
    NOID_KIT_API_KEY: process.env.NOID_KIT_API_KEY,
    NOID_KIT_URL: process.env.NOID_KIT_URL,
  }

  beforeEach(() => {
    resetNoidKitForTests()
    delete process.env.NOID_KIT_ENABLED
    delete process.env.NOID_KIT_API_KEY
    delete process.env.NOID_KIT_URL
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    resetNoidKitForTests()
  })

  it('defaults proxy off when flag or key is missing', () => {
    expect(noidKitEnabled()).toBe(false)
    process.env.NOID_KIT_ENABLED = '1'
    expect(noidKitEnabled()).toBe(false)
    process.env.NOID_KIT_API_KEY = 'nak_test_key'
    expect(noidKitEnabled()).toBe(true)
    process.env.NOID_KIT_ENABLED = '0'
    expect(noidKitEnabled()).toBe(false)
  })

  it('parses NOID_KIT_URL origin vs /mcp', () => {
    expect(noidKitUrls('').site).toBe('https://noid-agent-kit.onrender.com')
    expect(noidKitUrls('https://noid-agent-kit.onrender.com/mcp').mcp).toBe(
      'https://noid-agent-kit.onrender.com/mcp',
    )
    expect(noidKitUrls('https://noid-agent-kit.onrender.com').mcp).toBe(
      'https://noid-agent-kit.onrender.com/mcp',
    )
    expect(noidKitUrls('not a url').site).toBe('https://noid-agent-kit.onrender.com')
    expect(noidKitUrls('').rest).toBe('https://noid-agent-kit.onrender.com/api/v1')
    expect(noidKitUrls('').health).toBe('https://noid-agent-kit.onrender.com/health')
  })

  it('connect snippet has a placeholder key only', () => {
    const snippet = noidKitConnectSnippet()
    expect(snippet).toContain('https://noid-agent-kit.onrender.com/mcp')
    expect(snippet).toContain('nak_YOUR_KEY')
    expect(snippet).not.toMatch(/nak_[a-zA-Z0-9]{12,}/)
    expect(snippet.toLowerCase()).not.toMatch(/noidpad/)
  })

  it('public note is independent tooling with no earnings claims or forbidden regions', () => {
    expect(NOID_PUBLIC_NOTE.toLowerCase()).not.toMatch(/guaranteed|roi|income/)
    expect(NOID_PUBLIC_NOTE).toMatch(/No earnings promises/)
    expect(NOID_PUBLIC_NOTE).toMatch(/not affiliated with, partnered with, or audited by Parano1d/i)
    expect(NOID_PUBLIC_NOTE.toLowerCase()).not.toMatch(/official|partnership|noidpad/)
    expect(NOID_KIT_TOOLS).toContain('create_invoice')
    expect(NOID_KIT_TOOLS).toContain('verify_receipt')
    expect(NOID_KIT_TOOLS).toContain('get_whale_moves')
    expect(NOID_KIT_TOOLS).toContain('get_new_tokens')
    expect(NOID_KIT_TOOLS).toContain('create_launch_kit')
    expect(NOID_KIT_TOOLS).toHaveLength(16)
  })

  it('parses SSE JSON-RPC and tool text content', () => {
    const sse =
      'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"get_whale_moves"}]}}\n\n'
    expect(parseMcpRpcBody(sse)).toEqual({ tools: [{ name: 'get_whale_moves' }] })
    expect(() =>
      parseMcpRpcBody('event: message\ndata: {"jsonrpc":"2.0","id":1,"error":{"message":"nope"}}\n'),
    ).toThrow(/nope/)
    expect(parseNoidToolResult({ content: [{ type: 'text', text: '{"moves":[]}' }] })).toEqual({
      moves: [],
    })
  })

  it('lists tools from live tools/list and falls back', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"get_whale_moves"},{"name":"get_new_tokens"}]}}\n\n',
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      )
    }) as unknown as typeof fetch
    const names = await listNoidTools({ fetchImpl, now: 1 })
    expect(names).toEqual(['get_whale_moves', 'get_new_tokens'])
    const fail = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    resetNoidKitForTests()
    const fallback = await listNoidTools({ fetchImpl: fail, now: 1 })
    expect(fallback).toContain('create_invoice')
    expect(fallback).toContain('claim_payment')
    expect(fallback).toHaveLength(16)
  })

  it('public catalog is available even when proxy is off', async () => {
    const card = await noidPublicJson()
    expect(card.ok).toBe(true)
    expect(card.enabled).toBe(false)
    expect(card.proxyEnabled).toBe(false)
    expect(card.site).toBe('https://noid-agent-kit.onrender.com')
    expect(card.page).toBe('https://crewpay.dev/noid')
    expect(card.custody).toMatch(/never takes custody/i)
    expect(card.affiliation).toMatch(/Not affiliated/)
    expect(JSON.stringify(card).toLowerCase()).not.toMatch(/official|partnership|noidpad/)
  })

  it('proxyNoidRead calls REST then MCP tools/call with Bearer', async () => {
    process.env.NOID_KIT_ENABLED = '1'
    process.env.NOID_KIT_API_KEY = 'nak_test_secret'
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url)
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe('Bearer nak_test_secret')
      if (href.includes('/api/v1/alerts/whales')) {
        return new Response(JSON.stringify({ moves: [{ address: 'o1abc' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected ${href}`)
    }) as unknown as typeof fetch

    const data = await proxyNoidRead('whale_moves', { limit: 8, fetchImpl })
    expect(data).toEqual({ moves: [{ address: 'o1abc' }] })
  })

  it('falls back to MCP tools/call when REST is missing', async () => {
    process.env.NOID_KIT_ENABLED = '1'
    process.env.NOID_KIT_API_KEY = 'nak_test_secret'
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url)
      if (href.includes('/api/v1/alerts/tokens')) {
        return new Response('Cannot GET', { status: 404 })
      }
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe('Bearer nak_test_secret')
      const body = JSON.parse(String(init?.body || '{}')) as {
        method: string
        params: { name: string; arguments: { limit?: number } }
      }
      expect(body.method).toBe('tools/call')
      expect(body.params.name).toBe('get_new_tokens')
      expect(body.params.arguments.limit).toBe(5)
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: '{"tokens":[{"ticker":"DEMO"}]}' }] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as unknown as typeof fetch

    const data = await proxyNoidRead('new_tokens', { limit: 5, fetchImpl })
    expect(data).toEqual({ tokens: [{ ticker: 'DEMO' }] })
  })

  it('refuses proxy when the flag is off', async () => {
    await expect(proxyNoidRead('whale_moves')).rejects.toThrow(/off/)
  })
})
