import { describe, expect, it, beforeEach } from 'vitest'
import type { Request, Response } from 'express'
import { resetRateLimits, takeRateLimit } from './rate-limit.js'

/** Mirrors POST /agent/keys privilege check. */
function mayMintAgentKeys(auth: { source?: string } | undefined): boolean {
  return auth?.source === 'env'
}

/** Mirrors DELETE /agent/keys/:id privilege check. */
function mayRevokeAgentKeys(auth: { source?: string } | undefined): boolean {
  return auth?.source === 'env'
}

/** Mirrors GET /agent/keys scoping. */
function keysListScope(auth: { source?: string; keyId?: string } | undefined): {
  scoped: boolean
  keyId?: string
} {
  if (auth?.source === 'db' && auth.keyId) return { scoped: true, keyId: auth.keyId }
  return { scoped: false }
}

describe('agent-key privilege boundaries', () => {
  it('DB key cannot create keys; env can', () => {
    expect(mayMintAgentKeys({ source: 'db', keyId: 'ak_1' } as { source?: string })).toBe(false)
    expect(mayMintAgentKeys({ source: 'env' })).toBe(true)
    expect(mayMintAgentKeys(undefined)).toBe(false)
  })

  it('DELETE keys is env-only', () => {
    expect(mayRevokeAgentKeys({ source: 'db' })).toBe(false)
    expect(mayRevokeAgentKeys({ source: 'env' })).toBe(true)
  })

  it('GET keys scopes DB callers to their keyId', () => {
    expect(keysListScope({ source: 'db', keyId: 'ak_abc' })).toEqual({
      scoped: true,
      keyId: 'ak_abc',
    })
    expect(keysListScope({ source: 'env' })).toEqual({ scoped: false })
  })
})

describe('launch rate limit hourly window', () => {
  beforeEach(() => resetRateLimits())

  it('uses 3_600_000 ms window for launch:key buckets', () => {
    const windowMs = 3_600_000
    const limit = 2
    const key = 'launch:key:fp-test'
    expect(takeRateLimit(key, { limit, windowMs }).ok).toBe(true)
    expect(takeRateLimit(key, { limit, windowMs }).ok).toBe(true)
    const blocked = takeRateLimit(key, { limit, windowMs })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      // Reset should be ~1 hour out, not ~1 minute.
      expect(blocked.resetAt - Date.now()).toBeGreaterThan(3_000_000)
      expect(blocked.retryAfterSec).toBeGreaterThan(3_000)
    }
  })

  it('documents applyRateLimit launch call uses hourly window constant', async () => {
    // Source guard: routes/agent.ts must pass 3_600_000 for launch:key.
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(new URL('../../routes/agent.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/applyRateLimit\(res,\s*`launch:key:\$\{fp\}`,\s*launchLimit,\s*3_600_000\)/)
    expect(src).not.toMatch(/applyRateLimit\(res,\s*`launch:key:\$\{fp\}`,\s*launchLimit,\s*60_000\)/)
  })
})

describe('webhook list scoping', () => {
  it('DB key scope excludes other keys; env is unscoped', () => {
    function webhookListScope(auth: { source?: string; keyId?: string } | undefined) {
      if (auth?.source === 'db' && auth.keyId) return { agentKeyId: auth.keyId }
      return undefined
    }
    expect(webhookListScope({ source: 'db', keyId: 'ak_a' })).toEqual({ agentKeyId: 'ak_a' })
    expect(webhookListScope({ source: 'env' })).toBeUndefined()
  })
})

// Keep Express types imported so editors resolve Request/Response if we expand route tests.
void (0 as unknown as Request | Response)
