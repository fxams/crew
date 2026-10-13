/** In-flight KOL registration after "Register with X" — survives X opening in another app. */

export const PENDING_REG_KEY = 'crew_reg_pending'
export const PENDING_REG_TTL_MS = 15 * 60_000

export type PendingRegistration = {
  wallet: string
  startedAt: number
}

export function serializePendingRegistration(pending: PendingRegistration): string {
  return JSON.stringify({
    wallet: pending.wallet.trim(),
    startedAt: pending.startedAt,
  })
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
    return { wallet, startedAt }
  } catch {
    return null
  }
}

export function savePendingRegistration(
  wallet: string,
  startedAt = Date.now(),
  storage: Pick<Storage, 'setItem'> | null = defaultStorage(),
): PendingRegistration | null {
  const pending = { wallet: wallet.trim(), startedAt }
  if ((pending.wallet && pending.wallet.length < 32) || !storage) return null
  try {
    storage.setItem(PENDING_REG_KEY, serializePendingRegistration(pending))
    return pending
  } catch {
    return pending
  }
}

export function loadPendingRegistration(
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null = defaultStorage(),
  now = Date.now(),
): PendingRegistration | null {
  if (!storage) return null
  try {
    const pending = parsePendingRegistration(storage.getItem(PENDING_REG_KEY), now)
    if (!pending) {
      storage.removeItem(PENDING_REG_KEY)
      return null
    }
    return pending
  } catch {
    return null
  }
}

export function clearPendingRegistration(
  storage: Pick<Storage, 'removeItem'> | null = defaultStorage(),
): void {
  try {
    storage?.removeItem(PENDING_REG_KEY)
  } catch {
    /* private mode */
  }
}

function defaultStorage(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    return sessionStorage
  } catch {
    return null
  }
}
