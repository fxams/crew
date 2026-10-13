import { afterEach, describe, expect, it, vi } from 'vitest'
import * as jose from 'jose'
import {
  privyAppIdFromEnv,
  privyAppSecretFromEnv,
  privyJwksUrl,
  privyUserUrl,
  verifyPrivyPayoutWallet,
} from './privy.js'

const APP = 'privy-app-test'
const WALLET = '8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk'
const USER = 'did:privy:abc123'

function restoreEnv(key: string, prev: string | undefined) {
  if (prev === undefined) delete process.env[key]
  else process.env[key] = prev
}

describe('Privy env', () => {
  it('reads PRIVY_APP_ID or VITE_PRIVY_APP_ID and hides when unset', () => {
    const prevP = process.env.PRIVY_APP_ID
    const prevV = process.env.VITE_PRIVY_APP_ID
    const prevS = process.env.PRIVY_APP_SECRET
    delete process.env.PRIVY_APP_ID
    delete process.env.VITE_PRIVY_APP_ID
    delete process.env.PRIVY_APP_SECRET
    expect(privyAppIdFromEnv()).toBe('')
    expect(privyAppSecretFromEnv()).toBe('')
    process.env.VITE_PRIVY_APP_ID = 'vite-app'
    expect(privyAppIdFromEnv()).toBe('vite-app')
    process.env.PRIVY_APP_ID = 'dashboard-app'
    expect(privyAppIdFromEnv()).toBe('dashboard-app')
    process.env.PRIVY_APP_SECRET = 'secret'
    expect(privyAppSecretFromEnv()).toBe('secret')
    restoreEnv('PRIVY_APP_ID', prevP)
    restoreEnv('VITE_PRIVY_APP_ID', prevV)
    restoreEnv('PRIVY_APP_SECRET', prevS)
  })
})

describe('verifyPrivyPayoutWallet', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.PRIVY_APP_ID
    delete process.env.PRIVY_APP_SECRET
  })

  it('rejects when Privy is unset or the token is missing', async () => {
    await expect(verifyPrivyPayoutWallet({ token: 'x', address: WALLET })).rejects.toThrow(
      /not configured/i,
    )
    process.env.PRIVY_APP_ID = APP
    await expect(verifyPrivyPayoutWallet({ token: '', address: WALLET })).rejects.toThrow(
      /access token/i,
    )
  })

  it('accepts a JWKS-verified token when no app secret is set', async () => {
    process.env.PRIVY_APP_ID = APP
    const { publicKey, privateKey } = await jose.generateKeyPair('ES256')
    const jwk = await jose.exportJWK(publicKey)
    jwk.kid = 'test-key'
    jwk.use = 'sig'
    const token = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer('privy.io')
      .setAudience(APP)
      .setSubject(USER)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        expect(String(url)).toBe(privyJwksUrl(APP))
        return new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )

    const verified = await verifyPrivyPayoutWallet({ token, address: WALLET })
    expect(verified).toEqual({ userId: USER, address: WALLET })
  })

  it('requires the claimed wallet on the Privy user when a secret is set', async () => {
    process.env.PRIVY_APP_ID = APP
    process.env.PRIVY_APP_SECRET = 'app-secret'
    const { publicKey, privateKey } = await jose.generateKeyPair('ES256')
    const jwk = await jose.exportJWK(publicKey)
    jwk.kid = 'test-key'
    const token = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer('privy.io')
      .setAudience(APP)
      .setSubject(USER)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const href = String(url)
        if (href === privyJwksUrl(APP)) {
          return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
        }
        expect(href).toBe(privyUserUrl(USER))
        return new Response(
          JSON.stringify({
            linked_accounts: [{ type: 'wallet', chain_type: 'solana', address: WALLET }],
          }),
          { status: 200 },
        )
      }),
    )

    const verified = await verifyPrivyPayoutWallet({ token, address: WALLET })
    expect(verified.userId).toBe(USER)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const href = String(url)
        if (href === privyJwksUrl(APP)) {
          return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
        }
        return new Response(
          JSON.stringify({
            linked_accounts: [{ type: 'wallet', chain_type: 'solana', address: 'otherwallet111111111111111111111111' }],
          }),
          { status: 200 },
        )
      }),
    )
    await expect(verifyPrivyPayoutWallet({ token, address: WALLET })).rejects.toThrow(
      /does not own/i,
    )
  })
})
