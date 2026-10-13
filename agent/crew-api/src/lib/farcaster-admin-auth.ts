import { timingSafeEqual } from 'node:crypto'

export const ADMIN_TOKEN_ENVS = [
  'CREW_ADMIN_TOKEN',
  'CREW_FARCASTER_ADMIN_TOKEN',
  'ADMIN_TOKEN',
] as const

export const FARCASTER_NONCE_ENV = 'CREW_FARCASTER_NONCE'

function keysEqual(got: string, expected: string): boolean {
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function configuredAdminToken(env: NodeJS.ProcessEnv = process.env): string {
  for (const key of ADMIN_TOKEN_ENVS) {
    const v = env[key]?.trim()
    if (v) return v
  }
  return ''
}

export function configuredConnectNonce(env: NodeJS.ProcessEnv = process.env): string {
  return (env[FARCASTER_NONCE_ENV] || '').trim()
}

export function adminAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(configuredAdminToken(env) || configuredConnectNonce(env))
}

function firstString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

export function readAdminSecrets(req: {
  header(name: string): string | undefined
  query?: Record<string, unknown>
  body?: unknown
}): { token: string; nonce: string } {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const query = req.query || {}
  const auth = (req.header('authorization') || '').trim()
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ''
  return {
    token: firstString(
      req.header('x-crew-admin-token'),
      req.header('x-admin-token'),
      bearer,
      query.token,
      query.adminToken,
      body.token,
      body.adminToken,
    ),
    nonce: firstString(req.header('x-crew-admin-nonce'), query.nonce, body.nonce),
  }
}

export type AdminAuthOk = { ok: true; via: 'token' | 'nonce' }
export type AdminAuthFail = { ok: false; status: 401 | 503; error: string }
export type AdminAuthResult = AdminAuthOk | AdminAuthFail

export function matchAdminToken(
  got: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = configuredAdminToken(env)
  if (!expected || !got) return false
  return keysEqual(got, expected)
}

export function matchEnvNonce(
  got: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = configuredConnectNonce(env)
  if (!expected || !got) return false
  return keysEqual(got, expected)
}
