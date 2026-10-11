import { ZodError } from 'zod'

/** Minimal valid bodies agents can copy when a request is rejected. */
export const AGENT_EXAMPLES = {
  autohire: {
    name: 'Night Owl',
    ticker: 'HOOT',
    description: 'An owl that only trades after midnight.',
    seats: 5,
  },
  launch: {
    name: 'Night Owl',
    ticker: 'HOOT',
    description: 'An owl that only trades after midnight.',
    imageUrl: 'https://example.com/hoot.png',
    autoHire: true,
  },
} as const

function issuePath(path: readonly PropertyKey[]): string {
  return path.length ? path.map(String).join('.') : 'body'
}

/**
 * Human-readable error text. Zod errors used to be returned as a JSON string
 * dump, which agents (and humans) struggled to act on.
 */
export function errorMessage(err: unknown, fallback = 'request failed'): string {
  if (err instanceof ZodError) {
    const parts = err.issues.map((i) => `${issuePath(i.path)}: ${i.message}`)
    return `Invalid request — ${parts.join('; ')}`
  }
  if (err instanceof Error) return err.message
  return fallback
}

/** Structured issues for programmatic retries (empty for non-validation errors). */
export function errorIssues(err: unknown): { path: string; message: string }[] | undefined {
  if (!(err instanceof ZodError)) return undefined
  return err.issues.map((i) => ({ path: issuePath(i.path), message: i.message }))
}

/** `autoHire` accepts true | false | <seats number> | { seats }. */
export function normalizeAutoHireInput(v: unknown): unknown {
  if (v === true) return { seats: 5 }
  if (v === false || v === null) return undefined
  if (typeof v === 'number') return { seats: v }
  return v
}
