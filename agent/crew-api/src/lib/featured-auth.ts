/**
 * Auth for GET /api/coins/graduated-unfeatured and POST /api/coins/:mint/featured.
 * Server CREW_AGENT_API_KEY (and CREW_API_KEY for backward compat), plus a dedicated
 * ops role: sha256 allowlist CREW_FEATURE_AGENT_KEYS_SHA256 and/or agent_keys.ops.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { hashAgentKey, matchAgentKey } from './agent-keys.js'
import { readAgentKeyHeader } from './auth.js'

export const FEATURE_AGENT_KEYS_ENV = 'CREW_FEATURE_AGENT_KEYS_SHA256'

type MatchOps = (raw: string) => Promise<{ id: string; fingerprint: string; ops: boolean } | null>
let matchOpsImpl: MatchOps = defaultMatchOpsKey

export function setFeaturedOpsKeyMatch(fn: MatchOps | null) {
  matchOpsImpl = fn || defaultMatchOpsKey
}

async function defaultMatchOpsKey(raw: string) {
  const row = await matchAgentKey(raw)
  if (!row) return null
  return { id: row.id, fingerprint: row.fingerprint, ops: Boolean(row.ops) }
}

function keysEqual(got: string, expected: string): boolean {
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function hexEqual(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, 'hex')
    const right = Buffer.from(b, 'hex')
    if (left.length !== 32 || right.length !== 32) return false
    return timingSafeEqual(left, right)
  } catch {
    return false
  }
}

/** Parse comma/whitespace-separated sha256 hex digests. Invalid tokens are dropped. */
export function parseFeatureAgentKeyHashes(
  raw = process.env[FEATURE_AGENT_KEYS_ENV],
): string[] {
  return String(raw || '')
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f]{64}$/.test(s))
}

export function isAllowlistedFeatureKey(
  raw: string,
  hashes = parseFeatureAgentKeyHashes(),
): boolean {
  if (!raw || !hashes.length) return false
  const got = hashAgentKey(raw).toLowerCase()
  let ok = false
  for (const h of hashes) {
    if (hexEqual(got, h)) ok = true
  }
  return ok
}

function fingerprintOf(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 16)
}

/** Featured-ops gate. Does not accept ordinary self-serve agent keys. */
export async function requireFeaturedOpsKey(req: Request, res: Response, next: NextFunction) {
  const got = readAgentKeyHeader(req)
  const agentKey = process.env.CREW_AGENT_API_KEY?.trim() || ''
  const boardKey = process.env.CREW_API_KEY?.trim() || ''
  const allow = parseFeatureAgentKeyHashes()

  if (!got) {
    if (process.env.NODE_ENV === 'production') {
      if (!agentKey && !boardKey && !allow.length) {
        res.status(503).json({
          error: `CREW_AGENT_API_KEY or ${FEATURE_AGENT_KEYS_ENV} not configured`,
        })
        return
      }
      res.status(401).json({
        error: 'Unauthorized — missing API key.',
        fix: `Use CREW_AGENT_API_KEY, or a key whose sha256 is listed in ${FEATURE_AGENT_KEYS_ENV}.`,
      })
      return
    }
    next()
    return
  }

  if (agentKey && keysEqual(got, agentKey)) {
    req.crewAgentAuth = { source: 'env', fingerprint: fingerprintOf(got) }
    next()
    return
  }
  if (boardKey && keysEqual(got, boardKey)) {
    req.crewAgentAuth = { source: 'env', fingerprint: fingerprintOf(got) }
    next()
    return
  }
  if (isAllowlistedFeatureKey(got, allow)) {
    req.crewAgentAuth = { source: 'feature-allowlist', fingerprint: fingerprintOf(got) }
    next()
    return
  }

  try {
    const dbKey = await matchOpsImpl(got)
    if (dbKey?.ops) {
      req.crewAgentAuth = {
        source: 'db',
        fingerprint: dbKey.fingerprint,
        keyId: dbKey.id,
      }
      next()
      return
    }
  } catch {
    /* DB optional */
  }

  res.status(401).json({
    error: 'Unauthorized — featured ops key required.',
    fix: `Use CREW_AGENT_API_KEY, a sha256 listed in ${FEATURE_AGENT_KEYS_ENV}, or an agent key with ops=true.`,
  })
}
