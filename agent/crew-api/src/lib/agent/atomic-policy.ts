/**
 * When CREW_ATOMIC_REQUIRED is set, refuse the racy sequential create→lock
 * path unless CREW_ATOMIC_FALLBACK=1 is an explicit operator opt-in.
 */

function envFlag(name: string): boolean {
  const v = (process.env[name] || '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

export function isAtomicRequired(inputFlag?: boolean): boolean {
  return inputFlag === true || envFlag('CREW_ATOMIC_REQUIRED')
}

export function isAtomicFallbackEnabled(): boolean {
  return envFlag('CREW_ATOMIC_FALLBACK')
}

/** Sequential create→lock only when atomic is not required, or fallback is set. */
export function allowSequentialFeeLock(inputAtomicRequired?: boolean): boolean {
  if (!isAtomicRequired(inputAtomicRequired)) return true
  return isAtomicFallbackEnabled()
}

export function atomicRetryableError(failures: string[]): {
  ok: false
  error: string
  retryable: true
} {
  const detail = failures.filter(Boolean).join(' · ') || 'unknown'
  return {
    ok: false,
    retryable: true,
    error: `Atomic fee-lock required — retry launch. Jito and v0+ALT failed (${detail}). Sequential create→lock is disabled unless CREW_ATOMIC_FALLBACK=1. Check GET /health/jito and CREW_LOOKUP_TABLE.`,
  }
}
