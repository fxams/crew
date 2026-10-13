/** In-flight KOL registration after "Register with X" — survives X opening in another app. */

export const PENDING_REG_KEY = 'crew_reg_pending'
export const PENDING_REG_TTL_MS = 15 * 60_000
export const AUTORESTART_KEY = 'crew_reg_x_autorestart'
export const AUTORESTART_COOLDOWN_MS = 2 * 60_000
export const STUCK_OAUTH_KEY = 'crew_reg_x_stuck'

export type StuckXOauth = 'used' | 'expired'

export type PendingRegistration = {
  wallet: string
  startedAt: number
  sid?: string
}

export function isRecoverableXOauthError(
  error: string | null | undefined,
  xoauth?: string | null,
): boolean {
  const flag = String(xoauth || '').toLowerCase()
  if (flag === 'used' || flag === 'expired') return true
  const s = String(error || '')
  if (!s) return false
  return /already used/i.test(s) || /sign-in expired/i.test(s) || /session expired/i.test(s)
}

export function serializePendingRegistration(pending: PendingRegistration): string {
  return JSON.stringify({
    wallet: pending.wallet.trim(),
    startedAt: pending.startedAt,
    ...(pending.sid ? { sid: pending.sid } : {}),
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
    return sid ? { wallet, startedAt, sid } : { wallet, startedAt }
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
  opts?: { sid?: string; storage?: Pick<Storage, 'setItem'> | null },
): PendingRegistration | null {
  const sid = normalizeSid(opts?.sid)
  const pending: PendingRegistration = sid
    ? { wallet: wallet.trim(), startedAt, sid }
    : { wallet: wallet.trim(), startedAt }
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
      if (raw === 'used' || raw === 'expired') return raw
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
  return kind === 'expired'
    ? 'That X sign-in expired. Tap Start over for a fresh one.'
    : 'That X sign-in was already used. Tap Check if you finished in another browser, or Start over.'
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
