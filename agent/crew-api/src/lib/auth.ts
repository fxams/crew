import type { Request, Response, NextFunction } from 'express'
import { createHash, timingSafeEqual } from 'node:crypto'

function keysEqual(got: string, expected: string): boolean {
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Write endpoints require `x-crew-api-key` matching CREW_API_KEY.
 * Keep CREW_API_KEY server-only (never VITE_*). Frontend uses VITE_CREW_API_KEY
 * only if you accept that browser clients can call writes — prefer a dedicated
 * public write path later with wallet signatures.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.CREW_API_KEY?.trim()
  if (!expected) {
    // Open writes when unset (local/dev). Production must set CREW_API_KEY.
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ error: 'CREW_API_KEY not configured' })
      return
    }
    next()
    return
  }
  const got = (req.header('x-crew-api-key') || '').trim()
  if (!keysEqual(got, expected)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

/**
 * Agent routes prefer CREW_AGENT_API_KEY (server-only, never VITE_*).
 * When set, the browser CREW_API_KEY / VITE_CREW_API_KEY is rejected so a
 * scraped frontend key cannot Autohire/launch.
 * Falls back to CREW_API_KEY only when CREW_AGENT_API_KEY is unset (compat).
 */
export function requireAgentApiKey(req: Request, res: Response, next: NextFunction) {
  const agentKey = process.env.CREW_AGENT_API_KEY?.trim()
  const boardKey = process.env.CREW_API_KEY?.trim()
  const expected = agentKey || boardKey

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ error: 'CREW_AGENT_API_KEY (or CREW_API_KEY) not configured' })
      return
    }
    next()
    return
  }

  const got = (req.header('x-crew-api-key') || '').trim()
  if (!got || !keysEqual(got, expected)) {
    // Explicit reject when browser board key is used while a dedicated agent key exists.
    if (agentKey && boardKey && keysEqual(got, boardKey)) {
      res.status(401).json({
        error:
          'Unauthorized — use CREW_AGENT_API_KEY for /api/agent/* (browser CREW_API_KEY is not accepted).',
      })
      return
    }
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

/** Stable short fingerprint for rate-limit buckets (never log the raw key). */
export function apiKeyFingerprint(req: Request): string {
  const got = (req.header('x-crew-api-key') || '').trim() || 'anon'
  return createHash('sha256').update(got).digest('hex').slice(0, 16)
}

export function clientIp(req: Request): string {
  const xf = (req.header('x-forwarded-for') || '').split(',')[0]?.trim()
  return xf || req.ip || 'unknown'
}
