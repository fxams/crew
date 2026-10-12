import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { hashAgentKey } from './agent-keys.js'
import {
  FEATURE_AGENT_KEYS_ENV,
  isAllowlistedFeatureKey,
  parseFeatureAgentKeyHashes,
  requireFeaturedOpsKey,
  setFeaturedOpsKeyMatch,
} from './featured-auth.js'

function mockReq(headers: Record<string, string> = {}): Request {
  return {
    header(name: string) {
      return headers[name.toLowerCase()] || headers[name] || undefined
    },
  } as unknown as Request
}

function mockRes() {
  const out: {
    statusCode?: number
    body?: { error?: string }
    status: (n: number) => typeof out
    json: (b: unknown) => typeof out
  } = {
    status(n: number) {
      out.statusCode = n
      return out
    },
    json(b: unknown) {
      out.body = b as { error?: string }
      return out
    },
  }
  return out as unknown as Response & { statusCode?: number; body?: { error?: string } }
}

describe('CREW_FEATURE_AGENT_KEYS_SHA256 allowlist', () => {
  const raw = 'crew_ak_feature_ops_secret_key_aaaaaaaa'
  const digest = hashAgentKey(raw)

  afterEach(() => {
    delete process.env[FEATURE_AGENT_KEYS_ENV]
  })

  it('parses comma-separated sha256 hex and ignores junk', () => {
    expect(parseFeatureAgentKeyHashes(`${digest}, not-a-hash, ${digest.toUpperCase()}`)).toEqual([
      digest,
      digest,
    ])
    expect(parseFeatureAgentKeyHashes('')).toEqual([])
  })

  it('matches the raw key against listed hashes', () => {
    expect(isAllowlistedFeatureKey(raw, [digest])).toBe(true)
    expect(isAllowlistedFeatureKey('crew_ak_someone_else_bbbbbbbbbbbb', [digest])).toBe(false)
    expect(isAllowlistedFeatureKey(raw, [])).toBe(false)
    expect(createHash('sha256').update(raw).digest('hex')).toBe(digest)
  })
})

describe('requireFeaturedOpsKey', () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    CREW_API_KEY: process.env.CREW_API_KEY,
    CREW_AGENT_API_KEY: process.env.CREW_AGENT_API_KEY,
    ALLOW: process.env[FEATURE_AGENT_KEYS_ENV],
  }
  const opsRaw = 'crew_ak_ops_allowlisted_cccccccccccccccc'
  const opsHash = hashAgentKey(opsRaw)

  beforeEach(() => {
    process.env.NODE_ENV = 'production'
    process.env.CREW_AGENT_API_KEY = 'server-agent-key-bbbbbbbb'
    delete process.env.CREW_API_KEY
    delete process.env[FEATURE_AGENT_KEYS_ENV]
    setFeaturedOpsKeyMatch(async () => null)
  })
  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV
    if (saved.CREW_API_KEY) process.env.CREW_API_KEY = saved.CREW_API_KEY
    else delete process.env.CREW_API_KEY
    if (saved.CREW_AGENT_API_KEY) process.env.CREW_AGENT_API_KEY = saved.CREW_AGENT_API_KEY
    else delete process.env.CREW_AGENT_API_KEY
    if (saved.ALLOW) process.env[FEATURE_AGENT_KEYS_ENV] = saved.ALLOW
    else delete process.env[FEATURE_AGENT_KEYS_ENV]
    setFeaturedOpsKeyMatch(null)
  })

  async function run(headers: Record<string, string>) {
    const res = mockRes()
    let next = false
    await requireFeaturedOpsKey(mockReq(headers), res, () => {
      next = true
    })
    return { next, res }
  }

  it('accepts the server CREW_AGENT_API_KEY', async () => {
    const { next, res } = await run({ 'x-crew-api-key': 'server-agent-key-bbbbbbbb' })
    expect(next).toBe(true)
    expect(res.statusCode).toBeUndefined()
  })

  it('accepts a per-agent key whose sha256 is in CREW_FEATURE_AGENT_KEYS_SHA256', async () => {
    process.env[FEATURE_AGENT_KEYS_ENV] = opsHash
    const { next } = await run({ 'x-crew-api-key': opsRaw })
    expect(next).toBe(true)
  })

  it('accepts Authorization Bearer for an allowlisted key', async () => {
    process.env[FEATURE_AGENT_KEYS_ENV] = opsHash
    const { next } = await run({ authorization: `Bearer ${opsRaw}` })
    expect(next).toBe(true)
  })

  it('rejects a random self-serve agent key', async () => {
    process.env[FEATURE_AGENT_KEYS_ENV] = opsHash
    const { next, res } = await run({ 'x-crew-api-key': 'crew_ak_random_not_allowlisted_dddd' })
    expect(next).toBe(false)
    expect(res.statusCode).toBe(401)
    expect(String(res.body?.error || '')).toMatch(/featured ops/i)
  })

  it('accepts a DB agent key flagged ops', async () => {
    setFeaturedOpsKeyMatch(async (raw) =>
      raw === 'crew_ak_db_ops_key_eeeeeeeeeeee'
        ? { id: 'ak_ops1', fingerprint: 'fpops1', ops: true }
        : { id: 'ak_plain', fingerprint: 'fpplain', ops: false },
    )
    const allowed = await run({ 'x-crew-api-key': 'crew_ak_db_ops_key_eeeeeeeeeeee' })
    expect(allowed.next).toBe(true)
    const denied = await run({ 'x-crew-api-key': 'crew_ak_db_plain_key_ffffffffff' })
    expect(denied.next).toBe(false)
    expect(denied.res.statusCode).toBe(401)
  })

  it('rejects missing key in production', async () => {
    const { next, res } = await run({})
    expect(next).toBe(false)
    expect(res.statusCode).toBe(401)
  })
})
