type Entry = { expiresAt: number; status: number; body: unknown }

const store = new Map<string, Entry>()
const MAX_KEYS = 500

function prune(now: number) {
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k)
  }
  if (store.size <= MAX_KEYS) return
  const overflow = store.size - MAX_KEYS
  let i = 0
  for (const k of store.keys()) {
    store.delete(k)
    i += 1
    if (i >= overflow) break
  }
}

export function getIdempotent(key: string): Entry | null {
  const now = Date.now()
  prune(now)
  const hit = store.get(key)
  if (!hit) return null
  if (hit.expiresAt <= now) {
    store.delete(key)
    return null
  }
  return hit
}

export function setIdempotent(key: string, status: number, body: unknown, ttlMs = 15 * 60_000) {
  const now = Date.now()
  prune(now)
  store.set(key, { expiresAt: now + ttlMs, status, body })
}

export function resetIdempotency() {
  store.clear()
}

export function normalizeIdempotencyKey(raw: string | undefined): string | null {
  const k = (raw || '').trim()
  if (!k) return null
  if (k.length < 8 || k.length > 128) {
    throw new Error('x-idempotency-key must be 8–128 characters')
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(k)) {
    throw new Error('x-idempotency-key has invalid characters')
  }
  return k
}
