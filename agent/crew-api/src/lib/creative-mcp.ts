/**
 * CrewPay ↔ creative-mcp (Launchkit MCP).
 *
 * Public discovery is always on. Server-side generate (logo / banner / meme)
 * is behind CREATIVE_MCP_ENABLED (default off) and CREATIVE_MCP_API_KEY.
 * Nothing throws at boot if the key is missing.
 */

import { createHash, randomBytes } from 'node:crypto'

export const DEFAULT_CREATIVE_MCP_SITE = 'https://creative-mcp-40dj.onrender.com'

/** Live tools/list (2026-11-09) — fallback when the remote catalog is unreachable. */
export const CREATIVE_MCP_TOOLS = [
  'list_pricing',
  'get_balance',
  'get_job',
  'get_payment_info',
  'claim_payment',
  'generate_image',
  'generate_logo_kit',
  'generate_banner',
  'generate_sticker_pack',
  'generate_teaser_video',
  'generate_music_bed',
  'generate_launch_kit',
] as const

export const CREATIVE_STILL_KINDS = ['logo', 'banner', 'meme'] as const
export type CreativeStillKind = (typeof CREATIVE_STILL_KINDS)[number]

export const CREATIVE_PUBLIC_NOTE =
  'Logos, memes, banners, sticker packs, music, and short teaser videos for launches. 50-credit trial. Top-ups in USDC on Base. Humans stay the core. No earnings promises.'

const EARNINGS_TALK = /guaranteed|roi|100x|moon soon|get paid|earn income|passive income/i

export type CreativeMcpUrls = {
  site: string
  mcp: string
  serverCard: string
}

export type CreativeAsset = {
  id: string
  mint: string
  kind: CreativeStillKind
  prompt: string
  createdAt: number
  source: 'creative-mcp'
  urls: string[]
  mimeType?: string
  imageBase64?: string
}

const assets = new Map<string, CreativeAsset>()
const mintIndex = new Map<string, string[]>()
let toolsCache: { at: number; names: string[] } | null = null

export function resetCreativeMcpForTests() {
  assets.clear()
  mintIndex.clear()
  toolsCache = null
}

export function creativeMcpFlagOn(): boolean {
  const v = (process.env.CREATIVE_MCP_ENABLED || '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

export function creativeMcpApiKey(): string {
  return (process.env.CREATIVE_MCP_API_KEY || '').trim()
}

/** Generate is on only when the flag is set and a Bearer key exists. */
export function creativeMcpEnabled(): boolean {
  return creativeMcpFlagOn() && Boolean(creativeMcpApiKey())
}

export function creativeMcpUrls(raw = process.env.CREATIVE_MCP_URL): CreativeMcpUrls {
  const fallback: CreativeMcpUrls = {
    site: DEFAULT_CREATIVE_MCP_SITE,
    mcp: `${DEFAULT_CREATIVE_MCP_SITE}/mcp`,
    serverCard: `${DEFAULT_CREATIVE_MCP_SITE}/.well-known/mcp/server-card.json`,
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
    }
  } catch {
    return fallback
  }
}

export function creativeMcpConnectSnippet(urls = creativeMcpUrls()): string {
  return `{
  "mcpServers": {
    "launchkit-mcp": {
      "url": "${urls.mcp}",
      "headers": {
        "Authorization": "Bearer lk_YOUR_KEY"
      }
    }
  }
}`
}

export function isCreativeStillKind(value: unknown): value is CreativeStillKind {
  return typeof value === 'string' && (CREATIVE_STILL_KINDS as readonly string[]).includes(value)
}

export function utcDayKey(now = Date.now()): string {
  const d = new Date(now)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

export function defaultStillPrompt(
  kind: CreativeStillKind,
  ticker: string,
  name: string,
): string {
  const t = (ticker || 'COIN').replace(/^\$/, '').slice(0, 16).toUpperCase()
  const n = (name || t).slice(0, 48)
  const byKind =
    kind === 'logo'
      ? `Original logo for ${n} ($${t}). Clean mark, no wall of text.`
      : kind === 'banner'
        ? `Wide 3:1 launch banner for ${n} ($${t}). No slogans about returns.`
        : `Original meme still for ${n} ($${t}). Playful, no return claims.`
  if (EARNINGS_TALK.test(byKind)) return `Original ${kind} for $${t}.`
  return byKind
}

export function parseMcpRpcBody(text: string): unknown {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new Error('Empty creative-mcp response')
  const jsonText = trimmed.startsWith('{')
    ? trimmed
    : trimmed
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean)
        .join('\n')
  if (!jsonText) throw new Error('creative-mcp SSE had no data')
  const parsed = JSON.parse(jsonText) as {
    error?: { message?: string; code?: number }
    result?: unknown
  }
  if (parsed.error) {
    throw new Error(parsed.error.message || `creative-mcp error ${parsed.error.code ?? ''}`.trim())
  }
  return parsed.result
}

export type CreativeRpcDeps = {
  fetchImpl?: typeof fetch
  now?: number
  timeoutMs?: number
}

export async function creativeMcpRpc(
  method: string,
  params: unknown,
  opts: { auth?: boolean } & CreativeRpcDeps = {},
): Promise<unknown> {
  const { mcp } = creativeMcpUrls()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  }
  if (opts.auth) {
    const key = creativeMcpApiKey()
    if (!key) throw new Error('CREATIVE_MCP_API_KEY is not set')
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
      throw new Error(`creative-mcp HTTP ${res.status}`)
    }
    return parseMcpRpcBody(text)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('creative-mcp timed out')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function listCreativeTools(opts: CreativeRpcDeps = {}): Promise<string[]> {
  if (!opts.fetchImpl && process.env.VITEST) {
    return [...CREATIVE_MCP_TOOLS]
  }
  if (toolsCache && (opts.now ?? Date.now()) - toolsCache.at < 60 * 60_000) {
    return toolsCache.names
  }
  try {
    const result = await creativeMcpRpc('tools/list', {}, { auth: false, timeoutMs: 8_000, ...opts })
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
  return [...CREATIVE_MCP_TOOLS]
}

function extractHttpsUrls(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') {
    const matches = value.match(/https:\/\/[^\s"'<>]+/g) || []
    for (const u of matches) {
      const clean = u.replace(/[),.;]+$/, '')
      if (clean.startsWith('https://') && !into.includes(clean)) into.push(clean)
    }
    return into
  }
  if (Array.isArray(value)) {
    for (const item of value) extractHttpsUrls(item, into)
    return into
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) {
      extractHttpsUrls(child, into)
    }
  }
  return into
}

export function parseGenerateImageResult(result: unknown): {
  urls: string[]
  mimeType?: string
  imageBase64?: string
} {
  const urls = extractHttpsUrls(result)
  let mimeType: string | undefined
  let imageBase64: string | undefined
  const content = (result as { content?: unknown[] } | null)?.content
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== 'object') continue
      const row = item as { type?: string; data?: string; mimeType?: string; text?: string }
      if (row.type === 'image' && typeof row.data === 'string' && row.data.length > 32) {
        imageBase64 = row.data
        mimeType = typeof row.mimeType === 'string' ? row.mimeType : 'image/png'
      }
      if (row.type === 'text' && typeof row.text === 'string') {
        extractHttpsUrls(row.text, urls)
        const trimmed = row.text.trim()
        if (trimmed.startsWith('{')) {
          try {
            extractHttpsUrls(JSON.parse(trimmed), urls)
          } catch {
            /* not JSON */
          }
        }
      }
    }
  }
  return { urls, mimeType, imageBase64 }
}

export function listCreativeAssets(mint: string): CreativeAsset[] {
  const ids = mintIndex.get(mint) || []
  return ids.map((id) => assets.get(id)).filter((a): a is CreativeAsset => Boolean(a))
}

export function getCreativeAsset(id: string): CreativeAsset | null {
  return assets.get(id) || null
}

export function publicCreativeItem(
  asset: CreativeAsset,
  apiBase = 'https://api.crewpay.dev',
): {
  id: string
  kind: CreativeStillKind
  prompt: string
  createdAt: number
  url: string
} {
  const url = asset.urls[0] || `${apiBase.replace(/\/$/, '')}/api/creative/assets/${asset.id}`
  return {
    id: asset.id,
    kind: asset.kind,
    prompt: asset.prompt,
    createdAt: asset.createdAt,
    url,
  }
}

function countToday(mint: string, now: number): number {
  const day = utcDayKey(now)
  return listCreativeAssets(mint).filter((a) => utcDayKey(a.createdAt) === day).length
}

export function creativeMaxPerDay(): number {
  const n = Number(process.env.CREATIVE_MCP_MAX_PER_DAY)
  if (Number.isFinite(n) && n >= 0) return Math.min(24, Math.floor(n))
  return 6
}

export async function generateCoinStill(input: {
  mint: string
  ticker: string
  name: string
  kind: CreativeStillKind
  prompt?: string
  style?: string
  now?: number
  fetchImpl?: typeof fetch
}): Promise<CreativeAsset> {
  if (!creativeMcpEnabled()) {
    throw new Error('Creative generate is off (set CREATIVE_MCP_ENABLED=1 and CREATIVE_MCP_API_KEY)')
  }
  const now = input.now ?? Date.now()
  const mint = input.mint.trim()
  if (countToday(mint, now) >= creativeMaxPerDay()) {
    throw new Error(`Creative daily cap reached for this mint (${creativeMaxPerDay()} / UTC day)`)
  }
  const prompt = (input.prompt || defaultStillPrompt(input.kind, input.ticker, input.name)).slice(
    0,
    2000,
  )
  if (prompt.length < 3) throw new Error('prompt too short')
  const args: Record<string, unknown> = {
    prompt,
    kind: input.kind,
    owns_rights: true,
  }
  if (input.style) args.style = input.style.slice(0, 400)

  const result = await creativeMcpRpc(
    'tools/call',
    { name: 'generate_image', arguments: args },
    { auth: true, fetchImpl: input.fetchImpl, timeoutMs: 45_000 },
  )
  const parsed = parseGenerateImageResult(result)
  if (!parsed.urls.length && !parsed.imageBase64) {
    throw new Error('creative-mcp returned no asset')
  }
  const id = `cr_${randomBytes(8).toString('hex')}`
  const asset: CreativeAsset = {
    id,
    mint,
    kind: input.kind,
    prompt,
    createdAt: now,
    source: 'creative-mcp',
    urls: parsed.urls,
    mimeType: parsed.mimeType,
    imageBase64: parsed.imageBase64,
  }
  assets.set(id, asset)
  const ids = mintIndex.get(mint) || []
  ids.push(id)
  mintIndex.set(mint, ids)
  return asset
}

export function creativeKitBlock(mint: string, apiBase = 'https://api.crewpay.dev') {
  const urls = creativeMcpUrls()
  const enabled = creativeMcpEnabled()
  return {
    enabled,
    site: urls.site,
    mcp: urls.mcp,
    serverCard: urls.serverCard,
    page: 'https://crewpay.dev/creative',
    trialCredits: 50,
    pay: 'USDC on Base',
    tools: [...CREATIVE_MCP_TOOLS],
    stills: [...CREATIVE_STILL_KINDS],
    connect: creativeMcpConnectSnippet(urls),
    items: listCreativeAssets(mint).map((a) => publicCreativeItem(a, apiBase)),
    note: CREATIVE_PUBLIC_NOTE,
    hint: enabled
      ? 'Agents: POST /api/coins/{mint}/creative with kind=logo|banner|meme, or connect to creative-mcp. Humans stay the core for escrow jobs.'
      : 'Connect to creative-mcp for launch art. Server-side generate is off until CREATIVE_MCP_ENABLED=1.',
  }
}

export async function creativePublicJson(opts: CreativeRpcDeps = {}) {
  const urls = creativeMcpUrls()
  const tools = await listCreativeTools(opts)
  return {
    ok: true as const,
    service: 'creative-mcp',
    title: 'Creative',
    site: urls.site,
    mcp: urls.mcp,
    serverCard: urls.serverCard,
    page: 'https://crewpay.dev/creative',
    trial: {
      credits: 50,
      note: 'Free trial is 50 credits — enough for a couple of stills, not a full kit.',
    },
    pay: {
      asset: 'USDC',
      chain: 'base',
      note: 'Top up credits with native USDC on Base. Agents: get_payment_info then claim_payment.',
    },
    tools,
    stills: [...CREATIVE_STILL_KINDS],
    generateEnabled: creativeMcpEnabled(),
    coinEndpoint: 'POST /api/coins/{mint}/creative',
    mcpTool: 'crew_creative',
    connect: {
      snippet: creativeMcpConnectSnippet(urls),
      auth: 'initialize and tools/list work without a key. tools/call needs Authorization: Bearer lk_…',
    },
    note: CREATIVE_PUBLIC_NOTE,
  }
}

/** Fingerprint for logs — never log the raw key. */
export function creativeKeyFingerprint(): string | null {
  const key = creativeMcpApiKey()
  if (!key) return null
  return createHash('sha256').update(key).digest('hex').slice(0, 12)
}
