import { createHash, randomBytes } from 'node:crypto'

export type DryRunRecord = {
  id: string
  apiKeyFp: string
  bodyHash: string
  plan: unknown
  createdAt: number
  expiresAt: number
  approvedAt: number | null
  approveToken: string
  consumedAt: number | null
}

const store = new Map<string, DryRunRecord>()
const MAX = 1000
const TTL_MS = 30 * 60_000

function prune(now: number) {
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k)
  }
  if (store.size <= MAX) return
  const overflow = store.size - MAX
  let i = 0
  for (const k of store.keys()) {
    store.delete(k)
    i += 1
    if (i >= overflow) break
  }
}

/** Canonical hash of launch fields so dry-run and launch bodies must match. */
export function hashLaunchBody(body: Record<string, unknown>): string {
  const pick = {
    name: body.name,
    ticker: body.ticker,
    description: body.description ?? null,
    mode: body.mode ?? 'agent',
    initialBuySol: body.initialBuySol ?? 0,
    imageUrl: body.imageUrl ?? null,
    imageBase64: body.imageBase64 ? '[present]' : null,
    autoHire: body.autoHire ?? null,
    crew: body.crew ?? null,
    holderKol: body.holderKol ?? false,
    twitter: body.twitter ?? null,
    website: body.website ?? null,
    agent: body.agent ?? null,
  }
  return createHash('sha256').update(JSON.stringify(pick)).digest('hex')
}

export function createDryRun(opts: {
  apiKeyFp: string
  body: Record<string, unknown>
  plan: unknown
}): DryRunRecord {
  const now = Date.now()
  prune(now)
  const id = randomBytes(16).toString('hex')
  const approveToken = randomBytes(18).toString('base64url')
  const rec: DryRunRecord = {
    id,
    apiKeyFp: opts.apiKeyFp,
    bodyHash: hashLaunchBody(opts.body),
    plan: opts.plan,
    createdAt: now,
    expiresAt: now + TTL_MS,
    approvedAt: null,
    approveToken,
    consumedAt: null,
  }
  store.set(id, rec)
  return rec
}

export function getDryRun(id: string): DryRunRecord | null {
  const now = Date.now()
  prune(now)
  const rec = store.get(id)
  if (!rec || rec.expiresAt <= now) {
    if (rec) store.delete(id)
    return null
  }
  return rec
}

export function approveDryRun(id: string, approveToken: string): DryRunRecord {
  const rec = getDryRun(id)
  if (!rec) throw new Error('Unknown or expired dryRunId')
  if (rec.approveToken !== approveToken) throw new Error('Invalid approval token')
  if (rec.consumedAt) throw new Error('This dry-run was already used for a launch')
  rec.approvedAt = Date.now()
  return rec
}

/** Validate launch against an approved dry-run; marks it consumed. */
export function consumeApprovedDryRun(opts: {
  dryRunId: string
  apiKeyFp: string
  body: Record<string, unknown>
}): DryRunRecord {
  const rec = getDryRun(opts.dryRunId)
  if (!rec) throw new Error('Unknown or expired dryRunId — call POST /api/agent/launch/dry-run first')
  if (rec.apiKeyFp !== opts.apiKeyFp) {
    throw new Error('dryRunId was issued for a different API key')
  }
  if (rec.bodyHash !== hashLaunchBody(opts.body)) {
    throw new Error('Launch body does not match the dry-run that issued dryRunId')
  }
  if (!rec.approvedAt) {
    throw new Error(
      'Dry-run not approved yet — open the approvalUrl from dry-run and confirm before launch',
    )
  }
  if (rec.consumedAt) throw new Error('dryRunId already used for a launch')
  rec.consumedAt = Date.now()
  return rec
}

export function publicDryRunView(rec: DryRunRecord) {
  return {
    dryRunId: rec.id,
    createdAt: new Date(rec.createdAt).toISOString(),
    expiresAt: new Date(rec.expiresAt).toISOString(),
    approved: Boolean(rec.approvedAt),
    approvedAt: rec.approvedAt ? new Date(rec.approvedAt).toISOString() : null,
    consumed: Boolean(rec.consumedAt),
    plan: rec.plan,
  }
}

export function resetDryRunStore() {
  store.clear()
}
