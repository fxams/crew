import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CREATIVE_MCP_TOOLS,
  CREATIVE_PUBLIC_NOTE,
  creativeKitBlock,
  creativeMcpConnectSnippet,
  creativeMcpEnabled,
  creativeMcpUrls,
  defaultStillPrompt,
  generateCoinStill,
  listCreativeTools,
  parseGenerateImageResult,
  parseMcpRpcBody,
  resetCreativeMcpForTests,
  utcDayKey,
} from './creative-mcp.js'

describe('creative-mcp client', () => {
  const prev = {
    CREATIVE_MCP_ENABLED: process.env.CREATIVE_MCP_ENABLED,
    CREATIVE_MCP_API_KEY: process.env.CREATIVE_MCP_API_KEY,
    CREATIVE_MCP_URL: process.env.CREATIVE_MCP_URL,
    CREATIVE_MCP_MAX_PER_DAY: process.env.CREATIVE_MCP_MAX_PER_DAY,
  }

  beforeEach(() => {
    resetCreativeMcpForTests()
    delete process.env.CREATIVE_MCP_ENABLED
    delete process.env.CREATIVE_MCP_API_KEY
    delete process.env.CREATIVE_MCP_URL
    delete process.env.CREATIVE_MCP_MAX_PER_DAY
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    resetCreativeMcpForTests()
  })

  it('defaults generate off when flag or key is missing', () => {
    expect(creativeMcpEnabled()).toBe(false)
    process.env.CREATIVE_MCP_ENABLED = '1'
    expect(creativeMcpEnabled()).toBe(false)
    process.env.CREATIVE_MCP_API_KEY = 'lk_test_key'
    expect(creativeMcpEnabled()).toBe(true)
    process.env.CREATIVE_MCP_ENABLED = '0'
    expect(creativeMcpEnabled()).toBe(false)
  })

  it('parses CREATIVE_MCP_URL origin vs /mcp', () => {
    expect(creativeMcpUrls('').site).toBe('https://creative-mcp-40dj.onrender.com')
    expect(creativeMcpUrls('https://creative-mcp-40dj.onrender.com/mcp').mcp).toBe(
      'https://creative-mcp-40dj.onrender.com/mcp',
    )
    expect(creativeMcpUrls('https://creative-mcp-40dj.onrender.com').mcp).toBe(
      'https://creative-mcp-40dj.onrender.com/mcp',
    )
    expect(creativeMcpUrls('not a url').site).toBe('https://creative-mcp-40dj.onrender.com')
  })

  it('connect snippet has a placeholder key only', () => {
    const snippet = creativeMcpConnectSnippet()
    expect(snippet).toContain('https://creative-mcp-40dj.onrender.com/mcp')
    expect(snippet).toContain('lk_YOUR_KEY')
    expect(snippet).not.toMatch(/lk_[a-zA-Z0-9]{12,}/)
    expect(snippet.toLowerCase()).not.toMatch(/qatar|asia\/qatar|\+03:00|\bdeepcounterfeit\b/)
  })

  it('public note has no earnings claims or forbidden regions', () => {
    expect(CREATIVE_PUBLIC_NOTE.toLowerCase()).not.toMatch(/guaranteed|roi|income/)
    expect(CREATIVE_PUBLIC_NOTE).toMatch(/No earnings promises/)
    expect(CREATIVE_PUBLIC_NOTE.toLowerCase()).not.toMatch(/qatar|asia\/qatar|\+03:00/)
    expect(CREATIVE_PUBLIC_NOTE.toLowerCase()).not.toMatch(/deepcounterfeit/)
    expect(CREATIVE_MCP_TOOLS).toContain('generate_image')
    expect(CREATIVE_MCP_TOOLS).toContain('generate_launch_kit')
  })

  it('default prompts stay UTC-safe and skip earnings talk', () => {
    const logo = defaultStillPrompt('logo', 'HOOT', 'Night Owl')
    expect(logo).toMatch(/\$HOOT/)
    expect(logo.toLowerCase()).not.toMatch(/guaranteed|roi|get paid/)
    expect(utcDayKey(Date.UTC(2026, 10, 9, 15, 0, 0))).toBe('2026-11-09')
  })

  it('parses SSE JSON-RPC and image content', () => {
    const sse =
      'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"generate_image"}]}}\n\n'
    expect(parseMcpRpcBody(sse)).toEqual({ tools: [{ name: 'generate_image' }] })
    expect(() =>
      parseMcpRpcBody('event: message\ndata: {"jsonrpc":"2.0","id":1,"error":{"message":"nope"}}\n'),
    ).toThrow(/nope/)
    const parsed = parseGenerateImageResult({
      content: [
        { type: 'text', text: '{"url":"https://cdn.example.com/logo.png"}' },
        { type: 'image', mimeType: 'image/png', data: 'a'.repeat(40) },
      ],
    })
    expect(parsed.urls).toContain('https://cdn.example.com/logo.png')
    expect(parsed.imageBase64).toHaveLength(40)
  })

  it('lists tools from live tools/list and falls back', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"generate_image"},{"name":"get_job"}]}}\n\n',
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      )
    }) as unknown as typeof fetch
    const names = await listCreativeTools({ fetchImpl, now: 1 })
    expect(names).toEqual(['generate_image', 'get_job'])
    const fail = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    resetCreativeMcpForTests()
    const fallback = await listCreativeTools({ fetchImpl: fail, now: 1 })
    expect(fallback).toContain('generate_image')
    expect(fallback).toContain('claim_payment')
  })

  it('kit block is public even when generate is off', () => {
    const kit = creativeKitBlock('So11111111111111111111111111111111111111112')
    expect(kit.enabled).toBe(false)
    expect(kit.site).toBe('https://creative-mcp-40dj.onrender.com')
    expect(kit.items).toEqual([])
    expect(kit.note.toLowerCase()).not.toMatch(/guaranteed|roi/)
  })

  it('generateCoinStill calls tools/call with Bearer and stores the still', async () => {
    process.env.CREATIVE_MCP_ENABLED = '1'
    process.env.CREATIVE_MCP_API_KEY = 'lk_test_secret'
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe('Bearer lk_test_secret')
      const body = JSON.parse(String(init?.body || '{}')) as {
        method: string
        params: { name: string; arguments: { kind: string; owns_rights: boolean } }
      }
      expect(body.method).toBe('tools/call')
      expect(body.params.name).toBe('generate_image')
      expect(body.params.arguments.kind).toBe('logo')
      expect(body.params.arguments.owns_rights).toBe(true)
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: 'https://cdn.example.com/hoot.png' }] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as unknown as typeof fetch

    const asset = await generateCoinStill({
      mint: 'So11111111111111111111111111111111111111112',
      ticker: 'HOOT',
      name: 'Night Owl',
      kind: 'logo',
      now: Date.UTC(2026, 10, 9, 12, 0, 0),
      fetchImpl,
    })
    expect(asset.kind).toBe('logo')
    expect(asset.urls[0]).toBe('https://cdn.example.com/hoot.png')
    expect(asset.source).toBe('creative-mcp')
    const kit = creativeKitBlock(asset.mint)
    expect(kit.enabled).toBe(true)
    expect(kit.items).toHaveLength(1)
    expect(kit.items[0]?.url).toBe('https://cdn.example.com/hoot.png')
  })

  it('refuses generate when the flag is off', async () => {
    await expect(
      generateCoinStill({
        mint: 'So11111111111111111111111111111111111111112',
        ticker: 'HOOT',
        name: 'Owl',
        kind: 'meme',
      }),
    ).rejects.toThrow(/off/)
  })
})
