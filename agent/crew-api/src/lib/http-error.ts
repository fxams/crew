import type { Response } from 'express'

/** Log server-side and return a generic 500 — never leak err.message to clients. */
export function sendInternalError(res: Response, err: unknown, context?: string): void {
  console.error(context || 'internal error', err)
  res.status(500).json({ error: 'internal' })
}
