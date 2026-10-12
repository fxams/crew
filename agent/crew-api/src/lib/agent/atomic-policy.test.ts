import { afterEach, describe, expect, it } from 'vitest'
import {
  allowSequentialFeeLock,
  atomicRetryableError,
  isAtomicFallbackEnabled,
  isAtomicRequired,
} from './atomic-policy.js'

const saved = {
  CREW_ATOMIC_REQUIRED: process.env.CREW_ATOMIC_REQUIRED,
  CREW_ATOMIC_FALLBACK: process.env.CREW_ATOMIC_FALLBACK,
}

afterEach(() => {
  if (saved.CREW_ATOMIC_REQUIRED === undefined) delete process.env.CREW_ATOMIC_REQUIRED
  else process.env.CREW_ATOMIC_REQUIRED = saved.CREW_ATOMIC_REQUIRED
  if (saved.CREW_ATOMIC_FALLBACK === undefined) delete process.env.CREW_ATOMIC_FALLBACK
  else process.env.CREW_ATOMIC_FALLBACK = saved.CREW_ATOMIC_FALLBACK
})

describe('atomic fee-lock policy', () => {
  it('refuses sequential when CREW_ATOMIC_REQUIRED=1 and fallback is unset', () => {
    process.env.CREW_ATOMIC_REQUIRED = '1'
    delete process.env.CREW_ATOMIC_FALLBACK
    expect(isAtomicRequired()).toBe(true)
    expect(isAtomicFallbackEnabled()).toBe(false)
    expect(allowSequentialFeeLock()).toBe(false)
  })

  it('allows sequential only when CREW_ATOMIC_FALLBACK=1', () => {
    process.env.CREW_ATOMIC_REQUIRED = '1'
    process.env.CREW_ATOMIC_FALLBACK = '1'
    expect(allowSequentialFeeLock()).toBe(true)
  })

  it('allows sequential in local/dev when atomic is not required', () => {
    delete process.env.CREW_ATOMIC_REQUIRED
    delete process.env.CREW_ATOMIC_FALLBACK
    expect(allowSequentialFeeLock()).toBe(true)
    expect(allowSequentialFeeLock(true)).toBe(false)
  })

  it('returns a retryable error (no silent non-atomic)', () => {
    const err = atomicRetryableError(['jito: timeout', 'single-tx: too large'])
    expect(err.ok).toBe(false)
    expect(err.retryable).toBe(true)
    expect(err.error).toMatch(/retry launch/i)
    expect(err.error).toMatch(/CREW_ATOMIC_FALLBACK/)
    expect(err.error).toMatch(/\/health\/jito/)
  })
})
