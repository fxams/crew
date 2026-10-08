type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: number; resetAt: number; retryAfterSec: number }

/**
 * Fixed-window in-memory rate limiter (per process).
 * Good enough for a single Render instance; not a distributed quota.
 */
export function takeRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + opts.windowMs
    buckets.set(key, { count: 1, resetAt })
    return { ok: true, remaining: opts.limit - 1, resetAt }
  }
  if (existing.count >= opts.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    return { ok: false, remaining: 0, resetAt: existing.resetAt, retryAfterSec }
  }
  existing.count += 1
  return { ok: true, remaining: opts.limit - existing.count, resetAt: existing.resetAt }
}

/** Test helper */
export function resetRateLimits() {
  buckets.clear()
}
