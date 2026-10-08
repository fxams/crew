import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/** Block SSRF to loopback / RFC1918 / link-local / metadata hosts. */

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  '0.0.0.0',
])

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((p) => Number(p))
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return -1
  }
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const n = ipv4ToInt(ip)
    if (n < 0) return true
    if (n >= ipv4ToInt('10.0.0.0') && n <= ipv4ToInt('10.255.255.255')) return true
    if (n >= ipv4ToInt('172.16.0.0') && n <= ipv4ToInt('172.31.255.255')) return true
    if (n >= ipv4ToInt('192.168.0.0') && n <= ipv4ToInt('192.168.255.255')) return true
    if (n >= ipv4ToInt('127.0.0.0') && n <= ipv4ToInt('127.255.255.255')) return true
    if (n >= ipv4ToInt('169.254.0.0') && n <= ipv4ToInt('169.254.255.255')) return true
    if (n >= ipv4ToInt('100.64.0.0') && n <= ipv4ToInt('100.127.255.255')) return true
    if (n === 0) return true
    return false
  }
  if (v === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // ULA
    if (lower.startsWith('fe80')) return true // link-local
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.slice('::ffff:'.length)
      if (isIP(mapped) === 4) return isPrivateOrLocalIp(mapped)
    }
    return false
  }
  return true
}

export function assertSafeHttpUrl(raw: string, label = 'url'): URL {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`Invalid ${label}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must be http(s)`)
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not include credentials`)
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error(`${label} host is not allowed`)
  }
  if (isIP(host) && isPrivateOrLocalIp(host)) {
    throw new Error(`${label} resolves to a private/local address`)
  }
  return parsed
}

export async function assertPublicHostname(hostname: string, label = 'url'): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    if (isPrivateOrLocalIp(host)) throw new Error(`${label} resolves to a private/local address`)
    return
  }
  let records: { address: string; family: number }[]
  try {
    records = await lookup(host, { all: true, verbatim: true })
  } catch {
    throw new Error(`${label} host could not be resolved`)
  }
  if (!records.length) throw new Error(`${label} host could not be resolved`)
  for (const rec of records) {
    if (isPrivateOrLocalIp(rec.address)) {
      throw new Error(`${label} resolves to a private/local address`)
    }
  }
}

/**
 * Fetch a public HTTP(S) URL with redirect re-validation (SSRF-safe).
 */
export async function fetchPublicUrl(
  raw: string,
  opts?: { label?: string; maxRedirects?: number; timeoutMs?: number; headers?: Record<string, string> },
): Promise<Response> {
  const label = opts?.label || 'url'
  const maxRedirects = opts?.maxRedirects ?? 3
  const timeoutMs = opts?.timeoutMs ?? 12_000
  let current = assertSafeHttpUrl(raw, label)

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicHostname(current.hostname, label)
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(current.href, {
        redirect: 'manual',
        signal: ac.signal,
        headers: opts?.headers,
      })
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`${label} fetch timed out`)
      }
      throw new Error(`${label} fetch failed`)
    } finally {
      clearTimeout(timer)
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error(`${label} redirect missing Location`)
      current = assertSafeHttpUrl(new URL(loc, current).href, label)
      continue
    }
    return res
  }
  throw new Error(`${label} too many redirects`)
}
