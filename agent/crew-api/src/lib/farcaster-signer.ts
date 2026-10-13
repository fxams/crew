import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { query } from './db.js'
import {
  adminAuthConfigured,
  configuredConnectNonce,
  matchAdminToken,
  matchEnvNonce,
  readAdminSecrets,
  type AdminAuthResult,
} from './farcaster-admin-auth.js'

export type FarcasterAdminConnection = {
  fid: number
  signerUuid: string
  username: string | null
  connectedAt: string
}

export type FarcasterPublicStatus = {
  connected: boolean
  fid?: number
  username?: string | null
}

type DiskState = {
  connection: FarcasterAdminConnection | null
  nonces: Record<string, number>
  envNonceUsed?: boolean
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NONCE_TTL_MS = 30 * 60_000

const memory: DiskState = { connection: null, nonces: {}, envNonceUsed: false }

function useDb(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

function useDisk(): boolean {
  if (process.env.VITEST) return false
  return !useDb()
}

export function farcasterStorePath(): string {
  return (
    process.env.CREW_FARCASTER_STORE_PATH?.trim() ||
    join(process.cwd(), 'data', 'farcaster-admin.json')
  )
}

function loadDisk(): DiskState {
  try {
    const raw = readFileSync(farcasterStorePath(), 'utf8')
    const parsed = JSON.parse(raw) as DiskState
    return {
      connection: parsed.connection ?? null,
      nonces: parsed.nonces && typeof parsed.nonces === 'object' ? parsed.nonces : {},
      envNonceUsed: Boolean(parsed.envNonceUsed),
    }
  } catch {
    return { connection: null, nonces: {}, envNonceUsed: false }
  }
}

function persistDisk(state: DiskState): void {
  const path = farcasterStorePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
}

function activeState(): DiskState {
  if (!useDisk()) return memory
  const disk = loadDisk()
  memory.connection = disk.connection
  memory.nonces = disk.nonces
  memory.envNonceUsed = disk.envNonceUsed
  return memory
}

function saveState(): void {
  if (!useDisk()) return
  persistDisk({
    connection: memory.connection,
    nonces: memory.nonces,
    envNonceUsed: memory.envNonceUsed,
  })
}

export function resetFarcasterStoreForTests(): void {
  memory.connection = null
  memory.nonces = {}
  memory.envNonceUsed = false
}

export function publicFarcasterStatus(
  row: FarcasterAdminConnection | null,
): FarcasterPublicStatus {
  if (!row) return { connected: false }
  return { connected: true, fid: row.fid, username: row.username }
}

export function parseConnectBody(body: unknown): {
  signerUuid: string
  fid: number
  username: string | null
} {
  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const signerUuid = typeof rec.signer_uuid === 'string' ? rec.signer_uuid.trim() : ''
  const fid = typeof rec.fid === 'number' ? rec.fid : Number(rec.fid)
  const usernameRaw = typeof rec.username === 'string' ? rec.username.trim().replace(/^@+/, '') : ''
  if (!UUID_RE.test(signerUuid)) throw new Error('Invalid signer_uuid')
  if (!Number.isInteger(fid) || fid <= 0) throw new Error('Invalid fid')
  return { signerUuid, fid, username: usernameRaw ? usernameRaw.slice(0, 32) : null }
}

export async function getFarcasterConnection(): Promise<FarcasterAdminConnection | null> {
  if (useDb()) {
    try {
      const { rows } = await query<{
        fid: string
        signer_uuid: string
        username: string | null
        connected_at: Date
      }>(
        `SELECT fid::text, signer_uuid, username, connected_at
         FROM farcaster_admin WHERE id = 'default' LIMIT 1`,
      )
      const row = rows[0]
      if (!row) return null
      return {
        fid: Number(row.fid),
        signerUuid: row.signer_uuid,
        username: row.username,
        connectedAt: new Date(row.connected_at).toISOString(),
      }
    } catch {
      /* table optional — fall through to memory/file */
    }
  }
  return activeState().connection
}

export async function saveFarcasterConnection(input: {
  signerUuid: string
  fid: number
  username: string | null
}): Promise<FarcasterAdminConnection> {
  const row: FarcasterAdminConnection = {
    fid: input.fid,
    signerUuid: input.signerUuid,
    username: input.username,
    connectedAt: new Date().toISOString(),
  }
  if (useDb()) {
    try {
      await query(
        `INSERT INTO farcaster_admin (id, fid, signer_uuid, username, connected_at, updated_at)
         VALUES ('default', $1, $2, $3, now(), now())
         ON CONFLICT (id) DO UPDATE SET
           fid = EXCLUDED.fid,
           signer_uuid = EXCLUDED.signer_uuid,
           username = EXCLUDED.username,
           connected_at = now(),
           updated_at = now()`,
        [input.fid, input.signerUuid, input.username],
      )
    } catch {
      /* persist to file if migrate has not run */
    }
  }
  memory.connection = row
  saveState()
  return row
}

export async function issueFarcasterNonce(): Promise<{ nonce: string; expiresAt: number }> {
  const nonce = randomBytes(16).toString('hex')
  const expiresAt = Date.now() + NONCE_TTL_MS
  if (useDb()) {
    try {
      await query(
        `DELETE FROM farcaster_admin_nonces WHERE created_at < now() - interval '30 minutes'`,
      )
      await query(`INSERT INTO farcaster_admin_nonces (nonce, created_at) VALUES ($1, now())`, [
        nonce,
      ])
      return { nonce, expiresAt }
    } catch {
      /* fall through */
    }
  }
  const state = activeState()
  const now = Date.now()
  for (const [k, exp] of Object.entries(state.nonces)) {
    if (exp < now) delete state.nonces[k]
  }
  state.nonces[nonce] = expiresAt
  memory.nonces = state.nonces
  saveState()
  return { nonce, expiresAt }
}

export async function consumeFarcasterNonce(nonce: string): Promise<boolean> {
  if (!nonce || nonce.length < 16) return false
  if (useDb()) {
    try {
      const { rowCount } = await query(
        `DELETE FROM farcaster_admin_nonces
         WHERE nonce = $1 AND created_at >= now() - interval '30 minutes'`,
        [nonce],
      )
      if ((rowCount || 0) > 0) return true
    } catch {
      /* fall through */
    }
  }
  const state = activeState()
  const exp = state.nonces[nonce]
  if (exp && exp >= Date.now()) {
    delete state.nonces[nonce]
    memory.nonces = state.nonces
    saveState()
    return true
  }
  if (matchEnvNonce(nonce) && !state.envNonceUsed) {
    memory.envNonceUsed = true
    saveState()
    return true
  }
  return false
}

export async function authorizeFarcasterAdmin(
  req: {
    header(name: string): string | undefined
    query?: Record<string, unknown>
    body?: unknown
  },
  opts: { consumeNonce?: boolean } = {},
): Promise<AdminAuthResult> {
  if (!adminAuthConfigured() && Object.keys(memory.nonces).length === 0) {
    if (process.env.NODE_ENV === 'production') {
      return {
        ok: false,
        status: 503,
        error: 'CREW_ADMIN_TOKEN or CREW_FARCASTER_NONCE not configured',
      }
    }
  }
  const { token, nonce } = readAdminSecrets(req)
  if (matchAdminToken(token)) return { ok: true, via: 'token' }
  if (!nonce) {
    if (!adminAuthConfigured() && process.env.NODE_ENV !== 'production') {
      return { ok: false, status: 401, error: 'Unauthorized' }
    }
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  if (opts.consumeNonce) {
    const used = await consumeFarcasterNonce(nonce)
    if (used) return { ok: true, via: 'nonce' }
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  if (matchEnvNonce(nonce) && !memory.envNonceUsed && !activeState().envNonceUsed) {
    return { ok: true, via: 'nonce' }
  }
  const state = activeState()
  const exp = state.nonces[nonce]
  if (exp && exp >= Date.now()) return { ok: true, via: 'nonce' }
  if (useDb()) {
    try {
      const { rowCount } = await query(
        `SELECT 1 FROM farcaster_admin_nonces
         WHERE nonce = $1 AND created_at >= now() - interval '30 minutes'`,
        [nonce],
      )
      if ((rowCount || 0) > 0) return { ok: true, via: 'nonce' }
    } catch {
      /* ignore */
    }
  }
  return { ok: false, status: 401, error: 'Unauthorized' }
}

/** Public Neynar app id — same value as VITE_NEYNAR_CLIENT_ID. Not a secret. */
export function neynarClientId(env: NodeJS.ProcessEnv = process.env): string {
  return (env.NEYNAR_CLIENT_ID || '').trim()
}

/** Server-only Neynar key. Never a VITE_* value. */
export function neynarApiKey(env: NodeJS.ProcessEnv = process.env): string {
  return (env.NEYNAR_API_KEY || '').trim()
}

/** Optional username hydrate. Never throws; never logs the key. */
export async function lookupFarcasterUsername(fid: number): Promise<string | null> {
  const key = neynarApiKey()
  if (!key) return null
  try {
    const res = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: { 'x-api-key': key, accept: 'application/json' },
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      users?: Array<{ username?: string }>
    }
    const username = json.users?.[0]?.username?.trim().replace(/^@+/, '')
    return username || null
  } catch {
    return null
  }
}

export { readAdminSecrets }
