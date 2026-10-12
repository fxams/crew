import type { Request, Response, NextFunction } from 'express'
import { createHash, timingSafeEqual } from 'node:crypto'
import { matchAgentKey } from './agent-keys.js'

/**
 * Read the agent key from `x-crew-api-key` (canonical) or common aliases
 * agents reach for first: `Authorization: Bearer <key>` and `x-api-key`.
 */
export function readAgentKeyHeader(req: { header(name: string): string | undefined }): string {
  const direct = (req.header('x-crew-api-key') || '').trim()
  if (direct) return direct
  const auth = (req.header('authorization') || '').trim()
  const bearer = auth.match(/^Bearer\s+(.+)$/i)
  if (bearer?.[1]?.trim()) return bearer[1].trim()
  return (req.header('x-api-key') || '').trim()
}

/** 401 body that tells an agent exactly how to get unblocked. */
export function agentUnauthorizedBody(hadKey: boolean) {
  return {
    ok: false,
    error: hadKey
      ? 'Unauthorized — API key not recognized (revoked or mistyped).'
      : 'Unauthorized — missing API key.',
    fix: 'Get a free key in one call: POST https://api.crewpay.dev/api/agent/keys/claim (no auth, body {}). Then send it as header x-crew-api-key (Authorization: Bearer <key> also works).',
    claimUrl: 'https://api.crewpay.dev/api/agent/keys/claim',
    docs: 'https://crewpay.dev/llms.txt',
  }
}

function keysEqual(got: string, expected: string): boolean {
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export type AgentAuthContext = {
  source: 'env' | 'db' | 'x402'
  fingerprint: string
  launchesPerHour?: number
  keyId?: string
  /** Per-key human-approval gate (DB keys). Env keys default false. */
  requireApproval?: boolean
  /** x402 payer wallet (EVM 0x or Solana base58) — agent identity when paid per call. */
  payerWallet?: string
  payerNetwork?: 'base' | 'solana'
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      crewAgentAuth?: AgentAuthContext
    }
  }
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
 * Also accepts per-agent keys from the agent_keys table (created via API).
 * When env agent key is set, the browser CREW_API_KEY is rejected.
 */
export async function requireAgentApiKey(req: Request, res: Response, next: NextFunction) {
  const agentKey = process.env.CREW_AGENT_API_KEY?.trim()
  const boardKey = process.env.CREW_API_KEY?.trim()
  const expected = agentKey || boardKey
  const got = readAgentKeyHeader(req)

  if (got) {
    try {
      const dbKey = await matchAgentKey(got)
      if (dbKey) {
        req.crewAgentAuth = {
          source: 'db',
          fingerprint: dbKey.fingerprint,
          launchesPerHour: dbKey.launchesPerHour,
          keyId: dbKey.id,
          requireApproval: dbKey.requireApproval,
        }
        next()
        return
      }
    } catch {
      /* DB optional at boot — fall through to env keys */
    }
  }

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ error: 'CREW_AGENT_API_KEY (or CREW_API_KEY) not configured' })
      return
    }
    next()
    return
  }

  if (!got || !keysEqual(got, expected)) {
    if (agentKey && boardKey && got && keysEqual(got, boardKey)) {
      res.status(401).json({
        error:
          'Unauthorized — use CREW_AGENT_API_KEY for /api/agent/* (browser CREW_API_KEY is not accepted).',
      })
      return
    }
    res.status(401).json(agentUnauthorizedBody(Boolean(got)))
    return
  }

  req.crewAgentAuth = {
    source: 'env',
    fingerprint: createHash('sha256').update(got).digest('hex').slice(0, 16),
    // Env bootstrap key: optional CREW_REQUIRE_APPROVAL=1, else off by default.
    requireApproval:
      process.env.CREW_REQUIRE_APPROVAL === '1' || process.env.CREW_REQUIRE_APPROVAL === 'true',
  }
  next()
}

/** Stable short fingerprint for rate-limit buckets (never log the raw key). */
export function apiKeyFingerprint(req: Request): string {
  if (req.crewAgentAuth?.fingerprint) return req.crewAgentAuth.fingerprint
  const got = readAgentKeyHeader(req) || 'anon'
  return createHash('sha256').update(got).digest('hex').slice(0, 16)
}

export { clientIp } from './client-ip.js'
