import { afterEach, describe, expect, it, vi } from 'vitest'
import nacl from 'tweetnacl'
import {
  WALLET_AUTH_STORAGE_KEY,
  authenticateWallet,
  clearWalletAuth,
  completeSolanaAppConnect,
  connectMessage,
  isWalletAuthenticated,
  needsFreshWalletSignature,
  parseWalletAuth,
  readWalletAuth,
  writeWalletAuth,
} from './wallet-auth'

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed))
  return {
    get length() {
      return data.size
    },
    clear() {
      data.clear()
    },
    getItem(key) {
      return data.has(key) ? data.get(key)! : null
    },
    key(index) {
      return [...data.keys()][index] ?? null
    },
    removeItem(key) {
      data.delete(key)
    },
    setItem(key, value) {
      data.set(key, String(value))
    },
  }
}

const WALLET = '8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk'

describe('wallet SIWS auth cache', () => {
  it('does not treat a publicKey as authenticated without a verified session', () => {
    const storage = memoryStorage()
    expect(isWalletAuthenticated(WALLET, storage)).toBe(false)
    expect(needsFreshWalletSignature(WALLET, storage)).toBe(true)
    expect(parseWalletAuth(null)).toBeNull()
  })

  it('gates connected on a matching unexpired record', () => {
    const storage = memoryStorage()
    writeWalletAuth({ wallet: WALLET, expiresAt: Date.now() + 60_000 }, storage)
    expect(isWalletAuthenticated(WALLET, storage)).toBe(true)
    expect(isWalletAuthenticated('OtherWallet11111111111111111111111111', storage)).toBe(false)
    writeWalletAuth({ wallet: WALLET, expiresAt: Date.now() - 1 }, storage)
    expect(readWalletAuth(storage)).toBeNull()
    expect(isWalletAuthenticated(WALLET, storage)).toBe(false)
  })

  it('clears cached auth so the next connect must sign again', () => {
    const storage = memoryStorage()
    writeWalletAuth({ wallet: WALLET, expiresAt: Date.now() + 60_000 }, storage)
    clearWalletAuth(storage)
    expect(storage.getItem(WALLET_AUTH_STORAGE_KEY)).toBeNull()
    expect(isWalletAuthenticated(WALLET, storage)).toBe(false)
  })
})

describe('authenticateWallet', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests a nonce, signs it, and stores the verified session', async () => {
    const kp = nacl.sign.keyPair()
    const wallet = (await import('bs58')).default.encode(kp.publicKey)
    const nonce = 'ab'.repeat(16)
    const message = connectMessage(wallet, nonce)
    const storage = memoryStorage()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/wallet/connect/nonce')) {
        return new Response(JSON.stringify({ ok: true, nonce, message }), { status: 200 })
      }
      if (url.endsWith('/api/wallet/connect/verify')) {
        const body = JSON.parse(String(init?.body || '{}')) as { wallet?: string; nonce?: string }
        expect(body.wallet).toBe(wallet)
        expect(body.nonce).toBe(nonce)
        expect(init?.credentials).toBe('include')
        return new Response(
          JSON.stringify({
            ok: true,
            wallet,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          { status: 200 },
        )
      }
      throw new Error(`unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const record = await authenticateWallet({
      wallet,
      storage,
      signMessage: async (msg) => nacl.sign.detached(msg, kp.secretKey),
    })
    expect(record.wallet).toBe(wallet)
    expect(isWalletAuthenticated(wallet, storage)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('still requires signMessage when the adapter is already trusted/connected', async () => {
    const sign = vi.fn(async (msg: Uint8Array) => msg)
    const authenticate = vi.fn(async () => ({ wallet: WALLET, expiresAt: Date.now() + 60_000 }))
    await expect(
      completeSolanaAppConnect({
        wallet: WALLET,
        alreadyAuthenticated: false,
        signMessage: sign,
        authenticate,
      }),
    ).resolves.toBe('signed')
    expect(authenticate).toHaveBeenCalledWith({ wallet: WALLET, signMessage: sign })
    await expect(
      completeSolanaAppConnect({
        wallet: WALLET,
        alreadyAuthenticated: true,
        signMessage: sign,
        authenticate,
      }),
    ).resolves.toBe('reused-session')
    expect(authenticate).toHaveBeenCalledTimes(1)
    await expect(
      completeSolanaAppConnect({
        wallet: WALLET,
        alreadyAuthenticated: false,
        authenticate,
      }),
    ).rejects.toThrow(/cannot sign a message/i)
  })
})
