import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { query } from './db.js'

export type AgentKeyRow = {
  id: string
  label: string
  fingerprint: string
  launchesPerHour: number
  active: boolean
  ownerWallet: string | null
  /** When true, launch/wire-fees require an approved dryRunId. Default false. */
  requireApproval: boolean
  /** KOL referral code bound at claim — immutable once set. */
  referralCode: string | null
  createdAt: number
  lastUsedAt: number | null
}

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function fingerprint(raw: string): string {
  return hashKey(raw).slice(0, 16)
}

export async function createAgentKey(opts: {
  label: string
  launchesPerHour?: number
  ownerWallet?: string | null
  /** Bound once at claim — cannot be changed later. */
  referralCode?: string | null
}): Promise<{ key: string; row: AgentKeyRow }> {
  const id = `ak_${randomBytes(6).toString('hex')}`
  const key = `crew_ak_${randomBytes(24).toString('hex')}`
  const keyHash = hashKey(key)
  const fp = fingerprint(key)
  const launchesPerHour = Math.min(100, Math.max(1, opts.launchesPerHour ?? 5))
  const ownerWallet = opts.ownerWallet?.trim() || null
  const referralCode = opts.referralCode?.trim().toLowerCase() || null
  await query(
    `INSERT INTO agent_keys (
      id, label, key_hash, fingerprint, launches_per_hour, active, owner_wallet, require_approval, referral_code
    ) VALUES ($1,$2,$3,$4,$5, true, $6, false, $7)`,
    [id, opts.label.slice(0, 64), keyHash, fp, launchesPerHour, ownerWallet, referralCode],
  )
  return {
    key,
    row: {
      id,
      label: opts.label.slice(0, 64),
      fingerprint: fp,
      launchesPerHour,
      active: true,
      ownerWallet,
      requireApproval: false,
      referralCode,
      createdAt: Date.now(),
      lastUsedAt: null,
    },
  }
}

export async function listAgentKeys(opts?: {
  /** When set, only return that key (self-serve scoped list). */
  keyId?: string
}): Promise<AgentKeyRow[]> {
  const { rows } = opts?.keyId
    ? await query(
        `SELECT id, label, fingerprint, launches_per_hour, active, owner_wallet, require_approval,
                referral_code, created_at, last_used_at
         FROM agent_keys WHERE id = $1 LIMIT 1`,
        [opts.keyId],
      )
    : await query(
        `SELECT id, label, fingerprint, launches_per_hour, active, owner_wallet, require_approval,
                referral_code, created_at, last_used_at
         FROM agent_keys ORDER BY created_at DESC LIMIT 100`,
      )
  return rows.map((r) => ({
    id: String(r.id),
    label: String(r.label),
    fingerprint: String(r.fingerprint),
    launchesPerHour: Number(r.launches_per_hour),
    active: Boolean(r.active),
    ownerWallet: r.owner_wallet ? String(r.owner_wallet) : null,
    requireApproval: Boolean(r.require_approval),
    referralCode: r.referral_code ? String(r.referral_code) : null,
    createdAt: new Date(String(r.created_at)).getTime(),
    lastUsedAt: r.last_used_at ? new Date(String(r.last_used_at)).getTime() : null,
  }))
}

/** Owner wallet registered for an API key fingerprint (approver allowlist). */
export async function getOwnerWalletByFingerprint(fingerprint: string): Promise<string | null> {
  if (!fingerprint) return null
  const { rows } = await query(
    `SELECT owner_wallet FROM agent_keys
     WHERE active = true AND fingerprint = $1 AND owner_wallet IS NOT NULL
     LIMIT 1`,
    [fingerprint],
  )
  const w = rows[0]?.owner_wallet
  return w ? String(w) : null
}

export async function getOwnerWalletByKeyId(keyId: string): Promise<string | null> {
  if (!keyId) return null
  const { rows } = await query(
    `SELECT owner_wallet FROM agent_keys WHERE id = $1 AND active = true LIMIT 1`,
    [keyId],
  )
  const w = rows[0]?.owner_wallet
  return w ? String(w) : null
}

/** Bind / update the human owner wallet for a DB-backed API key (operator only). */
export async function setAgentKeyOwnerWallet(opts: {
  keyId: string
  ownerWallet: string
}): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE agent_keys SET owner_wallet = $2, updated_at = now()
     WHERE id = $1 AND active = true`,
    [opts.keyId, opts.ownerWallet],
  )
  return (rowCount || 0) > 0
}

/** Set require_approval for a DB-backed API key. */
export async function setAgentKeyRequireApproval(opts: {
  keyId: string
  requireApproval: boolean
}): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE agent_keys SET require_approval = $2, updated_at = now()
     WHERE id = $1 AND active = true`,
    [opts.keyId, opts.requireApproval],
  )
  return (rowCount || 0) > 0
}

export async function revokeAgentKey(id: string, opts?: { keyId?: string }): Promise<boolean> {
  // Self-serve keys may only revoke themselves; operator (no keyId filter) can revoke any.
  const { rowCount } = opts?.keyId
    ? await query(
        `UPDATE agent_keys SET active = false, updated_at = now() WHERE id = $1 AND id = $2`,
        [id, opts.keyId],
      )
    : await query(
        `UPDATE agent_keys SET active = false, updated_at = now() WHERE id = $1`,
        [id],
      )
  return (rowCount || 0) > 0
}

export async function matchAgentKey(
  raw: string,
): Promise<{
  id: string
  fingerprint: string
  launchesPerHour: number
  requireApproval: boolean
} | null> {
  if (!raw || raw.length < 16) return null
  const keyHash = hashKey(raw)
  const { rows } = await query(
    `SELECT id, fingerprint, launches_per_hour, COALESCE(require_approval, false) AS require_approval
     FROM agent_keys
     WHERE active = true AND key_hash = $1 LIMIT 1`,
    [keyHash],
  )
  const row = rows[0]
  if (!row) return null
  await query(`UPDATE agent_keys SET last_used_at = now() WHERE id = $1`, [row.id])
  return {
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    launchesPerHour: Number(row.launches_per_hour),
    requireApproval: Boolean(row.require_approval),
  }
}

export function envKeysEqual(got: string, expected: string): boolean {
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
