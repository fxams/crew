import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import {
  ADMIN_TOKEN_ENVS,
  adminAuthConfigured,
  configuredAdminToken,
  matchAdminToken,
  matchEnvNonce,
  readAdminSecrets,
} from './farcaster-admin-auth.js'
import { farcasterRouter } from '../routes/farcaster.js'
import {
  authorizeFarcasterAdmin,
  consumeFarcasterNonce,
  getFarcasterConnection,
  issueFarcasterNonce,
  parseConnectBody,
  publicFarcasterStatus,
  resetFarcasterStoreForTests,
  saveFarcasterConnection,
} from './farcaster-signer.js'

const UUID = '11111111-2222-4333-8444-555555555555'

function mockReq(
  headers: Record<string, string> = {},
  extra: { query?: Record<string, unknown>; body?: unknown } = {},
): Request {
  return {
    header(name: string) {
      return headers[name.toLowerCase()] || headers[name] || undefined
    },
    query: extra.query || {},
    body: extra.body,
  } as unknown as Request
}

function mockRes() {
  const out: {
    statusCode?: number
    body?: Record<string, unknown>
    status: (n: number) => typeof out
    json: (b: unknown) => typeof out
  } = {
    status(n: number) {
      out.statusCode = n
      return out
    },
    json(b: unknown) {
      out.body = b as Record<string, unknown>
      return out
    },
  }
  return out as unknown as Response & { statusCode?: number; body?: Record<string, unknown> }
}

function findRoute(method: string, path: string) {
  const stack = (
    farcasterRouter as unknown as {
      stack: Array<{
        route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> }
      }>
    }
  ).stack
  const layer = stack.find(
    (l) => l.route?.path === path && l.route.methods[method.toLowerCase()],
  )
  if (!layer?.route) throw new Error(`missing ${method} ${path}`)
  return layer.route.stack[0]!.handle as (
    req: Request,
    res: Response,
    next: () => void,
  ) => unknown
}

describe('farcaster admin auth', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    saved.NODE_ENV = process.env.NODE_ENV
    saved.DATABASE_URL = process.env.DATABASE_URL
    for (const key of ADMIN_TOKEN_ENVS) saved[key] = process.env[key]
    saved.CREW_FARCASTER_NONCE = process.env.CREW_FARCASTER_NONCE
    saved.NEYNAR_API_KEY = process.env.NEYNAR_API_KEY
    process.env.NODE_ENV = 'production'
    delete process.env.DATABASE_URL
    delete process.env.CREW_ADMIN_TOKEN
    delete process.env.CREW_FARCASTER_ADMIN_TOKEN
    delete process.env.ADMIN_TOKEN
    delete process.env.CREW_FARCASTER_NONCE
    delete process.env.NEYNAR_API_KEY
    resetFarcasterStoreForTests()
  })

  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV
    if (saved.DATABASE_URL) process.env.DATABASE_URL = saved.DATABASE_URL
    else delete process.env.DATABASE_URL
    for (const key of ADMIN_TOKEN_ENVS) {
      if (saved[key]) process.env[key] = saved[key]
      else delete process.env[key]
    }
    if (saved.CREW_FARCASTER_NONCE) process.env.CREW_FARCASTER_NONCE = saved.CREW_FARCASTER_NONCE
    else delete process.env.CREW_FARCASTER_NONCE
    if (saved.NEYNAR_API_KEY) process.env.NEYNAR_API_KEY = saved.NEYNAR_API_KEY
    else delete process.env.NEYNAR_API_KEY
    resetFarcasterStoreForTests()
  })

  it('reads CREW_ADMIN_TOKEN and rejects a wrong token', () => {
    process.env.CREW_ADMIN_TOKEN = 'adm-secret'
    expect(configuredAdminToken()).toBe('adm-secret')
    expect(adminAuthConfigured()).toBe(true)
    expect(matchAdminToken('adm-secret')).toBe(true)
    expect(matchAdminToken('nope')).toBe(false)
  })

  it('accepts x-crew-admin-token or Bearer', () => {
    expect(readAdminSecrets(mockReq({ 'x-crew-admin-token': 't1' }))).toEqual({
      token: 't1',
      nonce: '',
    })
    expect(readAdminSecrets(mockReq({ authorization: 'Bearer t2' }))).toEqual({
      token: 't2',
      nonce: '',
    })
    expect(readAdminSecrets(mockReq({ 'x-crew-admin-nonce': 'n1' }))).toEqual({
      token: '',
      nonce: 'n1',
    })
  })

  it('503s in production when no admin token or nonce is configured', async () => {
    const auth = await authorizeFarcasterAdmin(mockReq({ 'x-crew-admin-token': 'x' }))
    expect(auth).toEqual({
      ok: false,
      status: 503,
      error: 'CREW_ADMIN_TOKEN or CREW_FARCASTER_NONCE not configured',
    })
  })

  it('authorizes with admin token and stores signer without echoing it', async () => {
    process.env.CREW_ADMIN_TOKEN = 'adm-secret'
    const row = await saveFarcasterConnection({
      signerUuid: UUID,
      fid: 6131,
      username: 'crewpay',
    })
    const pub = publicFarcasterStatus(row)
    expect(pub).toEqual({ connected: true, fid: 6131, username: 'crewpay' })
    expect(JSON.stringify(pub)).not.toContain(UUID)
    expect(JSON.stringify(pub)).not.toContain('NEYNAR_API_KEY')
    expect((await getFarcasterConnection())?.signerUuid).toBe(UUID)
  })

  it('consumes a one-time nonce on POST and rejects reuse', async () => {
    process.env.CREW_ADMIN_TOKEN = 'adm-secret'
    const { nonce } = await issueFarcasterNonce()
    expect(await consumeFarcasterNonce(nonce)).toBe(true)
    expect(await consumeFarcasterNonce(nonce)).toBe(false)
  })

  it('consumes CREW_FARCASTER_NONCE once', async () => {
    process.env.CREW_FARCASTER_NONCE = 'one-time-nonce-aaaaaaaa'
    expect(matchEnvNonce('one-time-nonce-aaaaaaaa')).toBe(true)
    const auth = await authorizeFarcasterAdmin(
      mockReq({ 'x-crew-admin-nonce': 'one-time-nonce-aaaaaaaa' }),
      { consumeNonce: true },
    )
    expect(auth).toEqual({ ok: true, via: 'nonce' })
    const again = await authorizeFarcasterAdmin(
      mockReq({ 'x-crew-admin-nonce': 'one-time-nonce-aaaaaaaa' }),
      { consumeNonce: true },
    )
    expect(again.ok).toBe(false)
  })

  it('rejects a connect body that is not a SIWN signer', () => {
    expect(() => parseConnectBody({ fid: 1 })).toThrow(/signer_uuid/)
    expect(parseConnectBody({ signer_uuid: UUID, fid: 2, username: '@crew' })).toEqual({
      signerUuid: UUID,
      fid: 2,
      username: 'crew',
    })
  })

  it('POST /admin/farcaster requires admin auth and never returns signer_uuid', async () => {
    process.env.CREW_ADMIN_TOKEN = 'adm-secret'
    process.env.NEYNAR_API_KEY = 'neynar-server-secret-do-not-leak'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ users: [{ username: 'fromneynar' }] }),
    } as Response)
    const post = findRoute('post', '/admin/farcaster')
    const denied = mockRes()
    await post(mockReq({}, { body: { signer_uuid: UUID, fid: 9, username: 'x' } }), denied, () => {})
    expect(denied.statusCode).toBe(401)

    const ok = mockRes()
    await post(
      mockReq(
        { 'x-crew-admin-token': 'adm-secret' },
        { body: { signer_uuid: UUID, fid: 9, username: 'x' } },
      ),
      ok,
      () => {},
    )
    expect(ok.body?.ok).toBe(true)
    expect(ok.body?.fid).toBe(9)
    expect(ok.body?.username).toBe('fromneynar')
    expect(ok.body).not.toHaveProperty('signer_uuid')
    expect(ok.body).not.toHaveProperty('signerUuid')
    expect(JSON.stringify(ok.body)).not.toContain(UUID)
    expect(JSON.stringify(ok.body)).not.toContain('neynar-server-secret')
    expect(fetchMock).toHaveBeenCalled()
    const fetchHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as
      | Record<string, string>
      | undefined
    expect(fetchHeaders?.['x-api-key']).toBe('neynar-server-secret-do-not-leak')
    fetchMock.mockRestore()
  })

  it('GET /admin/farcaster returns Connected fields without the signer', async () => {
    process.env.CREW_ADMIN_TOKEN = 'adm-secret'
    await saveFarcasterConnection({ signerUuid: UUID, fid: 3, username: 'desk' })
    const get = findRoute('get', '/admin/farcaster')
    const res = mockRes()
    await get(mockReq({ 'x-crew-admin-token': 'adm-secret' }), res, () => {})
    expect(res.body).toEqual({ ok: true, connected: true, fid: 3, username: 'desk' })
  })

  it('issues a nonce only with the admin token', async () => {
    process.env.CREW_ADMIN_TOKEN = 'adm-secret'
    const post = findRoute('post', '/admin/farcaster/nonce')
    const denied = mockRes()
    await post(mockReq(), denied, () => {})
    expect(denied.statusCode).toBe(401)
    const ok = mockRes()
    await post(mockReq({ 'x-crew-admin-token': 'adm-secret' }), ok, () => {})
    expect(ok.body?.ok).toBe(true)
    expect(String(ok.body?.nonce || '').length).toBeGreaterThanOrEqual(16)
  })
})
