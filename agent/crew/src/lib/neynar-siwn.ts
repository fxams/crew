/**
 * Sign in with Neynar (SIWN) helpers. Client ID is public.
 * Neynar server credentials stay on crew-api only.
 */

export const SIWN_SCRIPT_SRC = 'https://neynarxyz.github.io/siwn/raw/1.2.0/index.js'
export const SIWN_CALLBACK_NAME = 'onCrewFarcasterSiwnSuccess'

export type NeynarEnv = Record<string, string | undefined>

export type SiwnUser = {
  username?: string
  display_name?: string
  fid?: number
}

export type SiwnSuccess = {
  signer_uuid: string
  fid: number
  username: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function readEnv(env: NeynarEnv, key: string): string {
  return (env[key] || '').trim()
}

/** Public Neynar client ID. Empty ⇒ hide the SIWN button. */
export function neynarClientId(env: NeynarEnv = import.meta.env as NeynarEnv): string {
  return readEnv(env, 'VITE_NEYNAR_CLIENT_ID')
}

export function siwnEnabled(env: NeynarEnv = import.meta.env as NeynarEnv): boolean {
  return Boolean(neynarClientId(env))
}

export function normalizeFarcasterUsername(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/^@+/, '').slice(0, 32)
}

export function parseSiwnSuccess(data: unknown): SiwnSuccess | null {
  if (!data || typeof data !== 'object') return null
  const rec = data as Record<string, unknown>
  const user = rec.user && typeof rec.user === 'object' ? (rec.user as SiwnUser) : {}
  const signer = typeof rec.signer_uuid === 'string' ? rec.signer_uuid.trim() : ''
  const fidRaw = rec.fid ?? user.fid
  const fid = typeof fidRaw === 'number' ? fidRaw : Number(fidRaw)
  const username = normalizeFarcasterUsername(user.username ?? rec.username)
  if (!UUID_RE.test(signer)) return null
  if (!Number.isInteger(fid) || fid <= 0) return null
  return { signer_uuid: signer, fid, username }
}

export function connectedAsLabel(username: string | null | undefined, fid: number): string {
  const handle = normalizeFarcasterUsername(username)
  const who = handle ? `@${handle}` : 'unknown'
  return `Connected as ${who}, FID ${fid}`
}

export function adminSecretFromSearch(search: string): { token: string; nonce: string } {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return {
    token: (params.get('token') || params.get('adminToken') || '').trim(),
    nonce: (params.get('nonce') || '').trim(),
  }
}

export function farcasterAdminHeaders(secret: { token?: string; nonce?: string }): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const token = (secret.token || '').trim()
  const nonce = (secret.nonce || '').trim()
  if (token) headers['x-crew-admin-token'] = token
  if (nonce) headers['x-crew-admin-nonce'] = nonce
  return headers
}
