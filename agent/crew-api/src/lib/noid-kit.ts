/**
 * CrewPay ↔ NOID Agent Kit (independent remote MCP for Parano1d / NOID).
 *
 * Public discovery is always on. Server-side read proxies (whale moves,
 * new tokens) are behind NOID_KIT_ENABLED (default off) and NOID_KIT_API_KEY.
 * Nothing throws at boot if the key is missing. CrewPay never takes custody.
 */

import { createHash } from 'node:crypto'

export const DEFAULT_NOID_KIT_SITE = 'https://noid-agent-kit.onrender.com'

/**
 * Live tools/list (2026-11-09) — fallback when the remote catalog is unreachable.
 * Source of truth: initialize/tools/list on the kit, plus server-card.json.
 */
export const NOID_KIT_TOOLS = [
  'list_pricing',
  'get_balance',
  'get_payment_info',
  'claim_payment',
  'get_quote',
  'create_invoice',
  'check_invoice',
  'list_invoices',
  'verify_receipt',
  'get_whale_moves',
  'get_new_tokens',
  'get_mempool_highlights',
  'get_hashrate_shift',
  'upsert_watchlist',
  'list_watchlists',
  'create_launch_kit',
] as const

export const NOID_KIT_PROXY_VIEWS = ['whale_moves', 'new_tokens'] as const
export type NoidKitProxyView = (typeof NOID_KIT_PROXY_VIEWS)[number]

export const NOID_PUBLIC_NOTE =
  'Independent remote MCP for Parano1d (NOID): checkout invoices and receipt verification, whale and new-token alerts, and a native-asset launch checklist. Not affiliated with, partnered with, or audited by Parano1d. 50-credit trial. Top-ups in USDC on Base. CrewPay never takes custody. No earnings promises.'

export type NoidKitUrls = {
  site: string
  mcp: string
  serverCard: string
  health: string
  rest: string
}

let toolsCache: { at: number; names: string[] } | null = null

export function resetNoidKitForTests() {
  toolsCache = null
}

export function noidKitFlagOn(): boolean {
  const v = (process.env.NOID_KIT_ENABLED || '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

export function noidKitApiKey(): string {
  return (process.env.NOID_KIT_API_KEY || '').trim()
}

/** Proxied reads are on only when the flag is set and a Bearer key exists. */
export function noidKitEnabled(): boolean {
  return noidKitFlagOn() && Boolean(noidKitApiKey())
}

export function noidKitUrls(raw = process.env.NOID_KIT_URL): NoidKitUrls {
  const fallback: NoidKitUrls = {
    site: DEFAULT_NOID_KIT_SITE,
    mcp: `${DEFAULT_NOID_KIT_SITE}/mcp`,
    serverCard: `${DEFAULT_NOID_KIT_SITE}/.well-known/mcp/server-card.json`,
    health: `${DEFAULT_NOID_KIT_SITE}/health`,
    rest: `${DEFAULT_NOID_KIT_SITE}/api/v1`,
  }
  const input = (raw || '').trim()
  if (!input) return fallback
  try {
    const u = new URL(input)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return fallback
    const path = u.pathname.replace(/\/+$/, '')
    const site = u.origin
    const mcp = path === '/mcp' || path.endsWith('/mcp') ? `${site}${path}` : `${site}/mcp`
    return {
      site,
      mcp,
      serverCard: `${site}/.well-known/mcp/server-card.json`,
      health: `${site}/health`,
      rest: `${site}/api/v1`,
    }
  } catch {
    return fallback
  }
}

export function noidKitConnectSnippet(urls = noidKitUrls()): string {
  return `{
  "mcpServers": {
    "noid-agent-kit": {
      "url": "${urls.mcp}",
      "headers": {
        "Authorization": "Bearer nak_YOUR_KEY"
      }
    }
  }
}`
}

export function isNoidKitProxyView(value: unknown): value is NoidKitProxyView {
  return typeof value === 'string' && (NOID_KIT_PROXY_VIEWS as readonly string[]).includes(value)
}

export function parseMcpRpcBody(text: string): unknown {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new Error('Empty noid-agent-kit response')
  const jsonText = trimmed.startsWith('{')
    ? trimmed
    : trimmed
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean)
        .join('\n')
  if (!jsonText) throw new Error('noid-agent-kit SSE had no data')
  const parsed = JSON.parse(jsonText) as {
    error?: { message?: string; code?: number }
    result?: unknown
  }
  if (parsed.error) {
    throw new Error(parsed.error.message || `noid-agent-kit error ${parsed.error.code ?? ''}`.trim())
  }
  return parsed.result
}

export function parseNoidToolResult(result: unknown): unknown {
  const content = (result as { content?: unknown[] } | null)?.content
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== 'object') continue
      const row = item as { type?: string; text?: string }
      if (row.type === 'text' && typeof row.text === 'string') {
        const trimmed = row.text.trim()
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            return JSON.parse(trimmed)
          } catch {
            return trimmed
          }
        }
        return trimmed
      }
    }
  }
  return result
}

export type NoidRpcDeps = {
  fetchImpl?: typeof fetch
  now?: number
  timeoutMs?: number
}

export async function noidKitRpc(
  method: string,
  params: unknown,
  opts: { auth?: boolean } & NoidRpcDeps = {},
): Promise<unknown> {
  const { mcp } = noidKitUrls()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  }
  if (opts.auth) {
    const key = noidKitApiKey()
    if (!key) throw new Error('NOID_KIT_API_KEY is not set')
    headers.authorization = `Bearer ${key}`
  }
  const timeoutMs = opts.timeoutMs ?? 25_000
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const fetchImpl = opts.fetchImpl || fetch
    const res = await fetchImpl(mcp, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params: params ?? {},
      }),
      signal: ac.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`noid-agent-kit HTTP ${res.status}`)
    }
    return parseMcpRpcBody(text)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('noid-agent-kit timed out')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function listNoidTools(opts: NoidRpcDeps = {}): Promise<string[]> {
  if (!opts.fetchImpl && process.env.VITEST) {
    return [...NOID_KIT_TOOLS]
  }
  if (toolsCache && (opts.now ?? Date.now()) - toolsCache.at < 60 * 60_000) {
    return toolsCache.names
  }
  try {
    const result = await noidKitRpc('tools/list', {}, { auth: false, timeoutMs: 8_000, ...opts })
    const tools = (result as { tools?: Array<{ name?: string }> } | null)?.tools
    const names = Array.isArray(tools)
      ? tools.map((t) => (typeof t?.name === 'string' ? t.name : '')).filter(Boolean)
      : []
    if (names.length) {
      toolsCache = { at: opts.now ?? Date.now(), names }
      return names
    }
  } catch {
    /* catalog is optional — public page still works */
  }
  return [...NOID_KIT_TOOLS]
}

function restPathForView(view: NoidKitProxyView): string {
  return view === 'whale_moves' ? '/alerts/whales' : '/alerts/tokens'
}

function toolNameForView(view: NoidKitProxyView): string {
  return view === 'whale_moves' ? 'get_whale_moves' : 'get_new_tokens'
}

export async function proxyNoidRead(
  view: NoidKitProxyView,
  opts: {
    limit?: number
    thresholdMicronoid?: string
    fetchImpl?: typeof fetch
    timeoutMs?: number
  } = {},
): Promise<unknown> {
  if (!noidKitEnabled()) {
    throw new Error('NOID kit proxy is off (set NOID_KIT_ENABLED=1 and NOID_KIT_API_KEY)')
  }
  const urls = noidKitUrls()
  const key = noidKitApiKey()
  const limit = opts.limit
  const timeoutMs = opts.timeoutMs ?? 20_000
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  const fetchImpl = opts.fetchImpl || fetch
  try {
    const qs = new URLSearchParams()
    if (limit != null) qs.set('limit', String(limit))
    if (view === 'whale_moves' && opts.thresholdMicronoid) {
      qs.set('threshold_micronoid', opts.thresholdMicronoid)
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const res = await fetchImpl(`${urls.rest}${restPathForView(view)}${suffix}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${key}`,
      },
      signal: ac.signal,
    })
    const text = await res.text()
    if (res.ok) {
      try {
        return JSON.parse(text) as unknown
      } catch {
        return { raw: text.slice(0, 2000) }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('noid-agent-kit timed out')
    }
    /* fall through to MCP tools/call */
  } finally {
    clearTimeout(timer)
  }

  const args: Record<string, unknown> = {}
  if (limit != null) args.limit = limit
  if (view === 'whale_moves' && opts.thresholdMicronoid) {
    args.threshold_micronoid = opts.thresholdMicronoid
  }
  const result = await noidKitRpc(
    'tools/call',
    { name: toolNameForView(view), arguments: args },
    { auth: true, fetchImpl: opts.fetchImpl, timeoutMs: 20_000 },
  )
  return parseNoidToolResult(result)
}

export async function noidPublicJson(opts: NoidRpcDeps = {}) {
  const urls = noidKitUrls()
  const tools = await listNoidTools(opts)
  return {
    ok: true as const,
    service: 'noid-agent-kit',
    title: 'NOID Agent Kit',
    site: urls.site,
    mcp: urls.mcp,
    serverCard: urls.serverCard,
    health: urls.health,
    rest: urls.rest,
    page: 'https://crewpay.dev/noid',
    trial: {
      credits: 50,
      note: 'Free trial is 50 credits ($0.50) — enough to try quotes, invoice checks, and light alerts, not a launch kit.',
    },
    pay: {
      asset: 'USDC',
      chain: 'base',
      creditUsd: 0.01,
      note: '1 credit = $0.01. Top up with native USDC on Base (get_payment_info then claim_payment, or x402). Live NOID/USD quotes use CoinPaprika via the kit price feed.',
    },
    tools,
    modules: {
      checkout: ['create_invoice', 'check_invoice', 'list_invoices', 'verify_receipt', 'get_quote'],
      alerts: [
        'get_whale_moves',
        'get_new_tokens',
        'get_mempool_highlights',
        'get_hashrate_shift',
        'upsert_watchlist',
        'list_watchlists',
      ],
      launch: ['create_launch_kit'],
      account: ['list_pricing', 'get_balance', 'get_payment_info', 'claim_payment'],
    },
    enabled: noidKitEnabled(),
    proxyEnabled: noidKitEnabled(),
    proxyEndpoints: {
      whaleMoves: 'GET /api/noid/whale-moves',
      newTokens: 'GET /api/noid/new-tokens',
    },
    mcpTool: 'crew_noid',
    connect: {
      snippet: noidKitConnectSnippet(urls),
      auth: 'initialize and tools/list work without a key. tools/call needs Authorization: Bearer nak_…',
      rest: 'REST under /api/v1 (e.g. POST /api/v1/quote) needs the same Bearer key. Health is GET /health.',
    },
    custody:
      'Merchants get paid in NOID straight to their own o1 address. The kit never holds keys or funds. CrewPay never takes custody.',
    affiliation:
      'Independent tooling. Not affiliated with, partnered with, or audited by Parano1d.',
    note: NOID_PUBLIC_NOTE,
  }
}

/** Fingerprint for logs — never log the raw key. */
export function noidKeyFingerprint(): string | null {
  const key = noidKitApiKey()
  if (!key) return null
  return createHash('sha256').update(key).digest('hex').slice(0, 12)
}
