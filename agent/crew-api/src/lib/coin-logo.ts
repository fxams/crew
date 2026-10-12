import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sniffImageType } from './agent/ipfs.js'
import { fetchPublicUrl } from './agent/safe-url.js'

/** Pump.fun’s dedicated Pinata gateway — usually faster than public ipfs.io. */
export const PUMP_IMAGE_CDN = 'https://pump.mypinata.cloud/ipfs/'

export const IPFS_GATEWAYS = [
  PUMP_IMAGE_CDN,
  'https://gateway.pinata.cloud/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://ipfs.io/ipfs/',
] as const

export const LOGO_MAX_BYTES = 2_000_000
export const LOGO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const LOGO_AVATAR_TTL_MS = 5 * 60 * 1000
export const LOGO_CACHE_CONTROL = 'public, max-age=604800, stale-while-revalidate=86400'
export const LOGO_AVATAR_CACHE_CONTROL = 'public, max-age=300'
const GATEWAY_TIMEOUT_MS = 4_000

export type IpfsRef = { cid: string; rest: string }

export type CachedLogo = {
  buf: Buffer
  contentType: string
  at: number
  kind: 'image' | 'avatar'
  source?: string
}

export type LogoFetchResult = {
  ok: boolean
  status: number
  buf: Buffer
}

export type LogoFetch = (url: string, timeoutMs: number) => Promise<LogoFetchResult>

const mem = new Map<string, CachedLogo>()
const inflight = new Map<string, Promise<CachedLogo>>()

let cacheDirImpl = process.env.COIN_LOGO_CACHE_DIR?.trim() || join(process.cwd(), 'data', 'coin-logos')
let fetchImpl: LogoFetch = defaultLogoFetch

export function setLogoCacheDir(dir: string | null) {
  cacheDirImpl = dir || join(process.cwd(), 'data', 'coin-logos')
}

export function setLogoFetch(fn: LogoFetch | null) {
  fetchImpl = fn || defaultLogoFetch
}

export function resetLogoCache() {
  mem.clear()
  inflight.clear()
}

export function isLogoMint(mint: string): boolean {
  const m = mint.trim()
  return /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(m) || /^0x[a-fA-F0-9]{40}$/.test(m)
}

export function cacheMintKey(mint: string): string {
  const m = mint.trim()
  return m.startsWith('0x') ? m.toLowerCase() : m
}

function isCid(s: string): boolean {
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(s)) return true
  if (/^baf[a-z2-7]{20,}$/i.test(s)) return true
  return false
}

/** Pull a CID (+ optional path) out of ipfs.io / dweb.link / ipfs:// / *.ipfs.* URLs. */
export function extractIpfsRef(raw: string): IpfsRef | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('ipfs://')) {
    const path = trimmed.slice('ipfs://'.length).replace(/^ipfs\//, '')
    const [cid, ...rest] = path.split('/').filter(Boolean)
    if (cid && isCid(cid)) return { cid, rest: rest.length ? `/${rest.join('/')}` : '' }
    return null
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  const sub = host.match(/^([a-z0-9]+)\.ipfs\./i)
  if (sub && isCid(sub[1]!)) {
    return { cid: sub[1]!, rest: url.pathname === '/' ? '' : url.pathname }
  }
  const m = url.pathname.match(/\/ipfs\/([a-zA-Z0-9]+)(\/.*)?$/i)
  if (m && isCid(m[1]!)) return { cid: m[1]!, rest: m[2] || '' }
  return null
}

/** Gateway list for an imageUrl. IPFS CIDs try pump CDN → Pinata → nftstorage → ipfs.io. */
export function logoCandidateUrls(imageUrl: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (u: string) => {
    if (!u || seen.has(u)) return
    seen.add(u)
    out.push(u)
  }
  const ref = extractIpfsRef(imageUrl)
  if (ref) {
    for (const gw of IPFS_GATEWAYS) push(`${gw}${ref.cid}${ref.rest}`)
    push(imageUrl)
    return out
  }
  push(imageUrl)
  return out
}

export function letterAvatarSvg(ticker: string): Buffer {
  const initial = (ticker || '?').trim().slice(0, 1).toUpperCase()
  const safe = /[A-Z0-9]/.test(initial) ? initial : '?'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-hidden="true">
  <rect width="96" height="96" rx="48" fill="#1a2a14"/>
  <text x="48" y="54" text-anchor="middle" fill="#c8ff3d" font-family="Syne, system-ui, sans-serif" font-size="42" font-weight="700">${safe}</text>
</svg>`
  return Buffer.from(svg)
}

export function avatarLogo(ticker: string, now = Date.now()): CachedLogo {
  return {
    buf: letterAvatarSvg(ticker),
    contentType: 'image/svg+xml; charset=utf-8',
    at: now,
    kind: 'avatar',
  }
}

async function defaultLogoFetch(url: string, timeoutMs: number): Promise<LogoFetchResult> {
  const res = await fetchPublicUrl(url, {
    label: 'coinLogo',
    maxRedirects: 3,
    timeoutMs,
  })
  if (!res.ok) {
    if (res.body) void res.body.cancel().catch(() => undefined)
    return { ok: false, status: res.status, buf: Buffer.alloc(0) }
  }
  const declared = Number(res.headers.get('content-length') || 0)
  if (Number.isFinite(declared) && declared > LOGO_MAX_BYTES) {
    if (res.body) void res.body.cancel().catch(() => undefined)
    return { ok: false, status: 413, buf: Buffer.alloc(0) }
  }
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > LOGO_MAX_BYTES) return { ok: false, status: 413, buf: Buffer.alloc(0) }
    return { ok: true, status: res.status, buf }
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > LOGO_MAX_BYTES) {
        await reader.cancel()
        return { ok: false, status: 413, buf: Buffer.alloc(0) }
      }
      chunks.push(value)
    }
  } catch {
    try {
      await reader.cancel()
    } catch {
      /* ignore */
    }
    return { ok: false, status: 599, buf: Buffer.alloc(0) }
  }
  return { ok: true, status: res.status, buf: Buffer.concat(chunks.map((c) => Buffer.from(c))) }
}

function cachePaths(mint: string) {
  const key = cacheMintKey(mint)
  return {
    key,
    bin: join(cacheDirImpl, `${key}.bin`),
    meta: join(cacheDirImpl, `${key}.json`),
  }
}

async function readDisk(mint: string): Promise<CachedLogo | null> {
  const { bin, meta } = cachePaths(mint)
  try {
    const [raw, buf] = await Promise.all([readFile(meta, 'utf8'), readFile(bin)])
    const parsed = JSON.parse(raw) as { contentType?: string; at?: number; source?: string; kind?: string }
    if (!parsed.contentType || !Number.isFinite(parsed.at) || !buf.byteLength) return null
    if (parsed.kind === 'avatar') return null
    return {
      buf,
      contentType: parsed.contentType,
      at: Number(parsed.at),
      kind: 'image',
      source: parsed.source,
    }
  } catch {
    return null
  }
}

async function writeDisk(mint: string, logo: CachedLogo): Promise<void> {
  if (logo.kind !== 'image') return
  const { bin, meta } = cachePaths(mint)
  try {
    await mkdir(cacheDirImpl, { recursive: true })
    await Promise.all([
      writeFile(bin, logo.buf),
      writeFile(
        meta,
        JSON.stringify({
          contentType: logo.contentType,
          at: logo.at,
          source: logo.source,
          kind: logo.kind,
          bytes: logo.buf.byteLength,
        }),
      ),
    ])
  } catch {
    /* cache miss next time is fine */
  }
}

function fresh(logo: CachedLogo, now: number): boolean {
  const ttl = logo.kind === 'image' ? LOGO_CACHE_TTL_MS : LOGO_AVATAR_TTL_MS
  return now - logo.at < ttl
}

/**
 * No sharp/jimp in this package — pass through sniffed bytes.
 * Already-webp logos stay webp; browsers scale the ~96px display size.
 */
export function prepareLogoBytes(buf: Buffer): { buf: Buffer; contentType: string } | null {
  const type = sniffImageType(buf)
  if (!type) return null
  if (buf.byteLength < 32) return null
  return { buf, contentType: type }
}

async function fetchFirstImage(imageUrl: string): Promise<{ buf: Buffer; contentType: string; source: string } | null> {
  const urls = logoCandidateUrls(imageUrl)
  for (const url of urls) {
    try {
      const res = await fetchImpl(url, GATEWAY_TIMEOUT_MS)
      if (!res.ok || !res.buf.byteLength) continue
      const prepared = prepareLogoBytes(res.buf)
      if (!prepared) continue
      return { ...prepared, source: url }
    } catch {
      continue
    }
  }
  return null
}

export async function resolveCoinLogo(input: {
  mint: string
  ticker: string
  imageUrl?: string | null
  now?: number
}): Promise<CachedLogo> {
  const now = input.now ?? Date.now()
  if (!isLogoMint(input.mint)) return avatarLogo(input.ticker, now)
  const key = cacheMintKey(input.mint)

  const cached = mem.get(key)
  if (cached && fresh(cached, now)) return cached

  const pending = inflight.get(key)
  if (pending) return pending

  const work = (async () => {
    const disk = await readDisk(input.mint)
    if (disk && fresh(disk, now)) {
      mem.set(key, disk)
      return disk
    }
    if (input.imageUrl) {
      const hit = await fetchFirstImage(input.imageUrl)
      if (hit) {
        const logo: CachedLogo = {
          buf: hit.buf,
          contentType: hit.contentType,
          at: now,
          kind: 'image',
          source: hit.source,
        }
        mem.set(key, logo)
        await writeDisk(input.mint, logo)
        return logo
      }
    }
    const avatar = avatarLogo(input.ticker, now)
    mem.set(key, avatar)
    return avatar
  })()

  inflight.set(key, work)
  try {
    return await work
  } finally {
    inflight.delete(key)
  }
}

export function logoCacheHeaders(logo: CachedLogo): Record<string, string> {
  return {
    'Content-Type': logo.contentType,
    'Cache-Control': logo.kind === 'image' ? LOGO_CACHE_CONTROL : LOGO_AVATAR_CACHE_CONTROL,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
  }
}
