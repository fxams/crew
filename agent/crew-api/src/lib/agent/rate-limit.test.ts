import { describe, expect, it, beforeEach } from 'vitest'
import { resetRateLimits, takeRateLimit } from './rate-limit.js'

describe('rate-limit', () => {
  beforeEach(() => resetRateLimits())

  it('allows up to the limit then blocks', () => {
    expect(takeRateLimit('k', { limit: 2, windowMs: 60_000 }).ok).toBe(true)
    expect(takeRateLimit('k', { limit: 2, windowMs: 60_000 }).ok).toBe(true)
    const blocked = takeRateLimit('k', { limit: 2, windowMs: 60_000 })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })
})
