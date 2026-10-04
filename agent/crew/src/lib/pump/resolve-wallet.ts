import { PublicKey } from '@solana/web3.js'
import { PUMP_FRONTEND_API, PUMP_RESOLVE_PROXY } from '../config'

export type WalletLinkKind = 'x_linked' | 'pump_username' | 'unverified'

export type WalletResolveOk = {
  ok: true
  handle: string
  wallet: string
  pumpUsername: string
  xUsername: string | null
  kind: WalletLinkKind
  /** True when Pump profile’s x_username matches the typed handle. */
  xVerified: boolean
  profileImage?: string
}

export type WalletResolveErr = {
  ok: false
  handle: string
  error: string
}

export type WalletResolveResult = WalletResolveOk | WalletResolveErr

type PumpUser = {
  address?: string
  canonical_svm_wallet?: string
  username?: string
  x_username?: string | null
  is_banned?: boolean
  profile_image?: string | null
  statusCode?: number
  message?: string
}

const HANDLE_BODY = /^[a-z0-9_]{1,15}$/i

/** Normalize @handle → bare lowercase username for Pump lookup. */
export function bareHandle(raw: string): string | null {
  const h = raw.trim().replace(/^@+/, '').toLowerCase()
  if (!HANDLE_BODY.test(h)) return null
  // Nest path collision: /users/search is the user named "search"
  if (h === 'search') return null
  return h
}

function isWallet(value: string): boolean {
  try {
    new PublicKey(value)
    return true
  } catch {
    return false
  }
}

function classify(handle: string, user: PumpUser): WalletLinkKind {
  const x = (user.x_username || '').replace(/^@+/, '').toLowerCase()
  if (x && x === handle) return 'x_linked'
  const pump = (user.username || '').replace(/^@+/, '').toLowerCase()
  if (pump === handle) return 'pump_username'
  return 'unverified'
}

function parsePumpUser(raw: unknown): PumpUser {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid Pump response.')
  return raw as PumpUser
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  // allorigins /get wraps: { contents: "<json string>", status: { http_code } }
  try {
    const outer = JSON.parse(text) as { contents?: string; status?: { http_code?: number } }
    if (typeof outer.contents === 'string') {
      const code = outer.status?.http_code
      if (code === 404) {
        throw Object.assign(new Error('not_found'), { status: 404 })
      }
      return JSON.parse(outer.contents)
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw err
  }
  // jina markdown sometimes wraps JSON — pull first {...} block
  const brace = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (brace >= 0 && end > brace) {
    return JSON.parse(text.slice(brace, end + 1))
  }
  return JSON.parse(text)
}

/**
 * Fetch JSON from Pump frontend API.
 * Direct calls are CORS-blocked outside pump.fun — fall back to a read proxy.
 */
export async function fetchPumpJson<T>(
  path: string,
  opts?: { signal?: AbortSignal; fetcher?: typeof fetch },
): Promise<T> {
  const fetcher = opts?.fetcher ?? fetch
  const target = `${PUMP_FRONTEND_API}${path.startsWith('/') ? path : `/${path}`}`

  const attempts: string[] = []
  // Local/dev Vite proxy (see vite.config.ts)
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    attempts.push(`/pump-api${path.startsWith('/') ? path : `/${path}`}`)
  }
  attempts.push(target)
  if (PUMP_RESOLVE_PROXY) {
    // Prefer /get wrapper so upstream 404 is visible
    const proxyBase = PUMP_RESOLVE_PROXY.includes('/raw?')
      ? PUMP_RESOLVE_PROXY.replace('/raw?', '/get?')
      : PUMP_RESOLVE_PROXY
    attempts.push(`${proxyBase}${encodeURIComponent(target)}`)
  }
  // Last-resort reader that allows CORS
  attempts.push(`https://r.jina.ai/${target}`)

  let lastErr: Error | null = null
  for (const url of attempts) {
    try {
      const res = await fetcher(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: opts?.signal,
      })
      if (res.status === 404) {
        throw Object.assign(new Error('not_found'), { status: 404 })
      }
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`)
        continue
      }
      const data = parsePumpUser(await readJson(res))
      if (data.statusCode === 404 || data.message === 'User not found') {
        throw Object.assign(new Error('not_found'), { status: 404 })
      }
      if (data.statusCode === 403) {
        lastErr = new Error('CORS blocked')
        continue
      }
      return data as T
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
        throw err
      }
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastErr ?? new Error('Pump lookup failed.')
}

/**
 * Resolve an X / Pump handle to a Solana fee-recipient wallet via Pump.fun’s user DB.
 * Prefer `canonical_svm_wallet`. Trust `x_username` match when present.
 */
export async function resolveHandleWallet(
  rawHandle: string,
  opts?: { signal?: AbortSignal; fetcher?: typeof fetch },
): Promise<WalletResolveResult> {
  const handle = bareHandle(rawHandle)
  if (!handle) {
    return { ok: false, handle: rawHandle.trim(), error: 'Enter a valid X handle to look up.' }
  }

  try {
    const user = await fetchPumpJson<PumpUser>(`/users/${encodeURIComponent(handle)}`, opts)
    if (user.is_banned) {
      return { ok: false, handle: `@${handle}`, error: 'Pump profile is banned.' }
    }
    const wallet = (user.canonical_svm_wallet || user.address || '').trim()
    if (!wallet || !isWallet(wallet)) {
      return { ok: false, handle: `@${handle}`, error: 'Pump profile has no wallet.' }
    }
    const pumpUsername = (user.username || handle).replace(/^@+/, '')
    const xUsername = user.x_username ? user.x_username.replace(/^@+/, '') : null
    const kind = classify(handle, user)
    return {
      ok: true,
      handle: `@${handle}`,
      wallet,
      pumpUsername,
      xUsername,
      kind,
      xVerified: kind === 'x_linked',
      profileImage: user.profile_image || undefined,
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
      return {
        ok: false,
        handle: `@${handle}`,
        error: 'No Pump profile for this handle — paste wallet manually.',
      }
    }
    return {
      ok: false,
      handle: `@${handle}`,
      error: 'Pump lookup unavailable — paste wallet manually.',
    }
  }
}

export function linkLabel(result: WalletResolveOk): string {
  if (result.xVerified) {
    return `Pump · X linked · ${result.wallet.slice(0, 4)}…${result.wallet.slice(-4)}`
  }
  if (result.kind === 'pump_username') {
    return `Pump @${result.pumpUsername} · ${result.wallet.slice(0, 4)}…${result.wallet.slice(-4)}`
  }
  return `Pump profile · ${result.wallet.slice(0, 4)}…${result.wallet.slice(-4)}`
}
