import type { Request, Response, NextFunction } from 'express'
import { timingSafeEqual } from 'node:crypto'

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
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}
