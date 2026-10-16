/** In-flight KOL registration after "Register with X" — survives X opening in another app. */

export const PENDING_REG_KEY = 'crew_reg_pending'
export const PENDING_REG_TTL_MS = 15 * 60_000
export const AUTORESTART_KEY = 'crew_reg_x_autorestart'
export const AUTORESTART_COOLDOWN_MS = 2 * 60_000
export const STUCK_OAUTH_KEY = 'crew_reg_x_stuck'

export type StuckXOauth = 'used' | 'expired' | 'cancelled'

export type PendingRegistration = {
  wallet: string
  startedAt: number
  sid?: string
  evmWallet?: string
}

export function isRecoverableXOauthError(
  error: string | null | undefined,
  xoauth?: string | null,
): boolean {
  const flag = String(xoauth || '').toLowerCase()
  if (flag === 'used' || flag === 'expired' || flag === 'cancelled') return true
  const s = String(error || '')
  if (!s) return false
  return (
    /already used/i.test(s) ||
    /sign-in expired/i.test(s) ||
    /session expired/i.test(s) ||
    /access_denied/i.test(s) ||
    /user.?denied/i.test(s) ||
    /cancell?ed/i.test(s)
  )
}

export function classifyStuckXOauth(
  error: string | null | undefined,
  xoauth?: string | null,
): StuckXOauth | null {
  const flag = String(xoauth || '').toLowerCase()
  if (flag === 'used' || flag === 'expired' || flag === 'cancelled') return flag
  const s = String(error || '')
  if (/already used/i.test(s)) return 'used'
  if (/sign-in expired|session expired/i.test(s)) return 'expired'
  if (/access_denied|user.?denied|cancell?ed/i.test(s)) return 'cancelled'
  return isRecoverableXOauthError(error, xoauth) ? 'used' : null
}

export function humanizeRegisterError(error: string | null | undefined): string {
  const s = String(error || '').trim()
  if (!s) return ''
  if (/failed to fetch|networkerror|load failed|network request failed|err_network/i.test(s)) {
    return 'Could not reach CrewPay. Check your connection, then tap Check or Start over.'
  }
  if (/access_denied|user.?denied/i.test(s)) {
    return 'X sign-in was cancelled. Tap Start over to try again.'
  }
  return s
}

export function serializePendingRegistration(pending: PendingRegistration): string {
  const evm = typeof pending.evmWallet === 'string' ? pending.evmWallet.trim() : ''
  return JSON.stringify({
    wallet: pending.wallet.trim(),
    startedAt: pending.startedAt,
    ...(pending.sid ? { sid: pending.sid } : {}),
    ...(evm ? { evmWallet: evm } : {}),
  })
}

function normalizeSid(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const sid = raw.trim().toLowerCase()
  return /^[a-f0-9]{32}$/.test(sid) ? sid : undefined
}

export function parsePendingRegistration(
  raw: string | null | undefined,
  now = Date.now(),
): PendingRegistration | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PendingRegistration>
    const wallet = typeof parsed.wallet === 'string' ? parsed.wallet.trim() : ''
    const startedAt = Number(parsed.startedAt)
    if ((wallet && wallet.length < 32) || !Number.isFinite(startedAt)) return null
    if (now - startedAt > PENDING_REG_TTL_MS) return null
    const sid = normalizeSid(parsed.sid)
    const evmWallet =
      typeof parsed.evmWallet === 'string' && parsed.evmWallet.trim() ? parsed.evmWallet.trim() : undefined
    const base = sid ? { wallet, startedAt, sid } : { wallet, startedAt }
    return evmWallet ? { ...base, evmWallet } : base
  } catch {
    return null
  }
}

function tryStore(name: 'sessionStorage' | 'localStorage'): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    const store = name === 'sessionStorage' ? window.sessionStorage : window.localStorage
    return store ?? null
  } catch {
    return null
  }
}

function defaultStores(): Storage[] {
  const out: Storage[] = []
  const session = tryStore('sessionStorage')
  const local = tryStore('localStorage')
  if (session) out.push(session)
  if (local) out.push(local)
  return out
}

export function savePendingRegistration(
  wallet: string,
  startedAt = Date.now(),
  opts?: { sid?: string; evmWallet?: string; storage?: Pick<Storage, 'setItem'> | null },
): PendingRegistration | null {
  const sid = normalizeSid(opts?.sid)
  const evmWallet =
    typeof opts?.evmWallet === 'string' && opts.evmWallet.trim() ? opts.evmWallet.trim() : undefined
  const pending: PendingRegistration = {
    wallet: wallet.trim(),
    startedAt,
    ...(sid ? { sid } : {}),
    ...(evmWallet ? { evmWallet } : {}),
  }
  if (pending.wallet && pending.wallet.length < 32) return null
  const stores =
    opts && 'storage' in opts ? (opts.storage ? [opts.storage] : []) : defaultStores()
  if (!stores.length) return pending
  const raw = serializePendingRegistration(pending)
  try {
    for (const store of stores) store.setItem(PENDING_REG_KEY, raw)
    return pending
  } catch {
    return pending
  }
}

export function loadPendingRegistration(
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null = null,
  now = Date.now(),
): PendingRegistration | null {
  const stores = storage ? [storage] : defaultStores()
  if (!stores.length) return null
  for (const store of stores) {
    try {
      const pending = parsePendingRegistration(store.getItem(PENDING_REG_KEY), now)
      if (pending) return pending
      store.removeItem(PENDING_REG_KEY)
    } catch {
      /* private mode / missing store */
    }
  }
  return null
}

export function clearPendingRegistration(
  storage: Pick<Storage, 'removeItem'> | null = null,
): void {
  const stores = storage ? [storage] : defaultStores()
  for (const store of stores) {
    try {
      store.removeItem(PENDING_REG_KEY)
    } catch {
      /* private mode */
    }
  }
}

export function loadStuckXOauth(
  storage?: Pick<Storage, 'getItem'> | null,
): StuckXOauth | null {
  const stores = storage ? [storage] : defaultStores()
  for (const store of stores) {
    try {
      const raw = String(store.getItem(STUCK_OAUTH_KEY) || '').toLowerCase()
      if (raw === 'used' || raw === 'expired' || raw === 'cancelled') return raw
    } catch {
      /* private mode */
    }
  }
  return null
}

export function saveStuckXOauth(
  kind: StuckXOauth,
  storage?: Pick<Storage, 'setItem'> | null,
): void {
  const stores = storage ? [storage] : defaultStores()
  for (const store of stores) {
    try {
      store.setItem(STUCK_OAUTH_KEY, kind)
    } catch {
      /* private mode */
    }
  }
}

export function clearStuckXOauth(
  storage?: Pick<Storage, 'removeItem'> | null,
): void {
  const stores = storage ? [storage] : defaultStores()
  for (const store of stores) {
    try {
      store.removeItem(STUCK_OAUTH_KEY)
    } catch {
      /* private mode */
    }
  }
}

export function stuckXOauthMessage(kind: StuckXOauth): string {
  if (kind === 'expired') return 'That X sign-in expired. Tap Start over for a fresh one.'
  if (kind === 'cancelled') return 'X sign-in was cancelled. Tap Start over to try again.'
  return 'That X sign-in was already used. Tap Check if you finished in another browser, or Start over.'
}

/** One auto-restart per cooldown so a broken callback cannot loop Register → used → Register. */
export function takeXOauthAutoRestart(
  now = Date.now(),
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null,
): boolean {
  const stores = storage ? [storage] : defaultStores()
  if (!stores.length) return true
  try {
    const recent = stores.some((store) => {
      const at = Number(store.getItem(AUTORESTART_KEY))
      return Number.isFinite(at) && now - at < AUTORESTART_COOLDOWN_MS
    })
    if (recent) return false
    for (const store of stores) store.setItem(AUTORESTART_KEY, String(now))
    return true
  } catch {
    return true
  }
}
