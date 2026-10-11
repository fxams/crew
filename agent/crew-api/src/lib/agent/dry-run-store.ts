/**
 * Dry-run + human approval gate for launch / wire-fees.
 *
 * Persistence: Postgres table `agent_dry_runs` when DATABASE_URL is set (production).
 * Falls back to in-memory Map for unit tests / local runs without a DB — that mode
 * does NOT survive restarts or multi-instance deploys (see README).
 *
 * Security: approve tokens are never returned to agents. Approval requires a wallet
 * signature on the approval page; agent API keys are rejected on the approve route.
 */

import { createHash, randomBytes } from 'node:crypto'
import { query } from '../db.js'

export type DryRunIntent = 'launch' | 'wire-fees'

export type DryRunRecord = {
  id: string
  apiKeyFp: string
  intent: DryRunIntent
  bodyHash: string
  imageSha256: string | null
  plan: unknown
  createdAt: number
  expiresAt: number
  approvedAt: number | null
  approvedByWallet: string | null
  consumedAt: number | null
}

const memory = new Map<string, DryRunRecord>()
const MAX = 1000
const TTL_MS = 30 * 60_000

function useDb(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

function pruneMemory(now: number) {
  for (const [k, v] of memory) {
    if (v.expiresAt <= now) memory.delete(k)
  }
  if (memory.size <= MAX) return
  const overflow = memory.size - MAX
  let i = 0
  for (const k of memory.keys()) {
    memory.delete(k)
    i += 1
    if (i >= overflow) break
  }
}

export function buildApproveMessage(dryRunId: string, timestamp: number): string {
  return `crew-approve-dry-run:${dryRunId}:${timestamp}`
}

/** Canonical hash for launch bodies — binds image *content* via sha256 of bytes. */
export function hashLaunchBody(
  body: Record<string, unknown>,
  imageSha256: string,
): string {
  const pick = {
    intent: 'launch' as const,
    name: body.name,
    ticker: body.ticker,
    description: body.description ?? null,
    mode: body.mode ?? 'agent',
    initialBuySol: body.initialBuySol ?? 0,
    imageSha256,
    autoHire: body.autoHire ?? null,
    crew: body.crew ?? null,
    holderKol: body.holderKol ?? false,
    twitter: body.twitter ?? null,
    website: body.website ?? null,
    agent: body.agent ?? null,
  }
  return createHash('sha256').update(JSON.stringify(pick)).digest('hex')
}

/** Canonical hash for wire-fees bodies. */
export function hashWireBody(body: Record<string, unknown>): string {
  const pick = {
    intent: 'wire-fees' as const,
    mint: body.mint,
    mode: body.mode ?? 'agent',
    name: body.name ?? null,
    ticker: body.ticker ?? null,
    crew: body.crew ?? null,
  }
  return createHash('sha256').update(JSON.stringify(pick)).digest('hex')
}

function rowToRec(row: {
  id: string
  api_key_fp: string
  intent: string
  body_hash: string
  image_sha256: string | null
  plan: unknown
  created_at: Date | string
  expires_at: Date | string
  approved_at: Date | string | null
  approved_by_wallet: string | null
  consumed_at: Date | string | null
}): DryRunRecord {
  const toMs = (v: Date | string) => (v instanceof Date ? v.getTime() : new Date(v).getTime())
  return {
    id: row.id,
    apiKeyFp: row.api_key_fp,
    intent: row.intent === 'wire-fees' ? 'wire-fees' : 'launch',
    bodyHash: row.body_hash,
    imageSha256: row.image_sha256,
    plan: row.plan,
    createdAt: toMs(row.created_at),
    expiresAt: toMs(row.expires_at),
    approvedAt: row.approved_at ? toMs(row.approved_at) : null,
    approvedByWallet: row.approved_by_wallet,
    consumedAt: row.consumed_at ? toMs(row.consumed_at) : null,
  }
}

export async function createDryRun(opts: {
  apiKeyFp: string
  intent: DryRunIntent
  bodyHash: string
  imageSha256: string | null
  plan: unknown
}): Promise<DryRunRecord> {
  const now = Date.now()
  const id = randomBytes(16).toString('hex')
  const rec: DryRunRecord = {
    id,
    apiKeyFp: opts.apiKeyFp,
    intent: opts.intent,
    bodyHash: opts.bodyHash,
    imageSha256: opts.imageSha256,
    plan: opts.plan,
    createdAt: now,
    expiresAt: now + TTL_MS,
    approvedAt: null,
    approvedByWallet: null,
    consumedAt: null,
  }

  if (!useDb()) {
    pruneMemory(now)
    memory.set(id, rec)
    return rec
  }

  await query(
    `INSERT INTO agent_dry_runs (
      id, api_key_fp, intent, body_hash, image_sha256, plan,
      created_at, expires_at, approved_at, approved_by_wallet, consumed_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::jsonb,
      to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0),
      NULL, NULL, NULL
    )`,
    [
      rec.id,
      rec.apiKeyFp,
      rec.intent,
      rec.bodyHash,
      rec.imageSha256,
      JSON.stringify(rec.plan ?? null),
      rec.createdAt,
      rec.expiresAt,
    ],
  )
  return rec
}

export async function getDryRun(id: string): Promise<DryRunRecord | null> {
  const now = Date.now()
  if (!useDb()) {
    pruneMemory(now)
    const rec = memory.get(id)
    if (!rec || rec.expiresAt <= now) {
      if (rec) memory.delete(id)
      return null
    }
    return rec
  }

  const { rows } = await query<{
    id: string
    api_key_fp: string
    intent: string
    body_hash: string
    image_sha256: string | null
    plan: unknown
    created_at: Date
    expires_at: Date
    approved_at: Date | null
    approved_by_wallet: string | null
    consumed_at: Date | null
  }>(
    `SELECT id, api_key_fp, intent, body_hash, image_sha256, plan,
            created_at, expires_at, approved_at, approved_by_wallet, consumed_at
     FROM agent_dry_runs
     WHERE id = $1 AND expires_at > now()`,
    [id],
  )
  const row = rows[0]
  return row ? rowToRec(row) : null
}

/** Wallet-signed human approval (no agent API key, no shared secret in the dry-run response). */
export async function approveDryRunWithWallet(
  id: string,
  wallet: string,
): Promise<DryRunRecord> {
  const rec = await getDryRun(id)
  if (!rec) throw new Error('Unknown or expired dryRunId')
  if (rec.consumedAt) throw new Error('This dry-run was already used')
  if (rec.approvedAt) {
    // Idempotent re-approve by same or any wallet once approved
    return rec
  }
  const approvedAt = Date.now()
  if (!useDb()) {
    rec.approvedAt = approvedAt
    rec.approvedByWallet = wallet
    memory.set(id, rec)
    return rec
  }
  await query(
    `UPDATE agent_dry_runs
     SET approved_at = to_timestamp($2 / 1000.0),
         approved_by_wallet = $3
     WHERE id = $1 AND approved_at IS NULL AND consumed_at IS NULL`,
    [id, approvedAt, wallet],
  )
  const updated = await getDryRun(id)
  if (!updated?.approvedAt) throw new Error('Failed to approve dry-run')
  return updated
}

/** Validate spend against an approved dry-run; marks it consumed. */
export async function consumeApprovedDryRun(opts: {
  dryRunId: string
  apiKeyFp: string
  intent: DryRunIntent
  bodyHash: string
  imageSha256?: string | null
}): Promise<DryRunRecord> {
  const rec = await getDryRun(opts.dryRunId)
  if (!rec) throw new Error('Unknown or expired dryRunId — call POST /api/agent/launch/dry-run first')
  if (rec.apiKeyFp !== opts.apiKeyFp) {
    throw new Error('dryRunId was issued for a different API key')
  }
  if (rec.intent !== opts.intent) {
    throw new Error(`dryRunId intent is ${rec.intent}, expected ${opts.intent}`)
  }
  if (rec.bodyHash !== opts.bodyHash) {
    throw new Error('Request body does not match the dry-run that issued dryRunId')
  }
  if (opts.intent === 'launch') {
    if (!opts.imageSha256 || !rec.imageSha256 || opts.imageSha256 !== rec.imageSha256) {
      throw new Error('Image content does not match the approved dry-run (sha256 mismatch)')
    }
  }
  if (!rec.approvedAt) {
    throw new Error(
      'Dry-run not approved yet — open the approvalUrl, connect a wallet, and confirm before spending SOL',
    )
  }
  if (rec.consumedAt) throw new Error('dryRunId already used')

  const consumedAt = Date.now()
  if (!useDb()) {
    rec.consumedAt = consumedAt
    memory.set(rec.id, rec)
    return rec
  }
  const { rowCount } = await query(
    `UPDATE agent_dry_runs
     SET consumed_at = to_timestamp($2 / 1000.0)
     WHERE id = $1 AND consumed_at IS NULL AND approved_at IS NOT NULL`,
    [opts.dryRunId, consumedAt],
  )
  if (!rowCount) throw new Error('dryRunId already used or not approved')
  const updated = await getDryRun(opts.dryRunId)
  if (!updated) throw new Error('dryRunId disappeared after consume')
  return updated
}

export function publicDryRunView(rec: DryRunRecord) {
  return {
    dryRunId: rec.id,
    intent: rec.intent,
    createdAt: new Date(rec.createdAt).toISOString(),
    expiresAt: new Date(rec.expiresAt).toISOString(),
    approved: Boolean(rec.approvedAt),
    approvedAt: rec.approvedAt ? new Date(rec.approvedAt).toISOString() : null,
    approvedByWallet: rec.approvedByWallet,
    consumed: Boolean(rec.consumedAt),
    imageSha256: rec.imageSha256,
    plan: rec.plan,
  }
}

export function resetDryRunStore() {
  memory.clear()
}

/** Persistence mode for discovery / health docs. */
export function dryRunStoreMode(): 'postgres' | 'memory' {
  return useDb() ? 'postgres' : 'memory'
}
