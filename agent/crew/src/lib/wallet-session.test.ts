import { afterEach, describe, expect, it, vi } from 'vitest'
import { PENDING_REG_KEY } from './register-pending'
import { WALLET_AUTH_STORAGE_KEY, isWalletAuthenticated, writeWalletAuth } from './wallet-auth'
import {
  MOBILE_AUTH_CACHE_KEY,
  USER_DISCONNECTED_KEY,
  WALLET_ADAPTER_STORAGE_KEY,
  clearPrivySession,
  isUserDisconnected,
  persistExplicitDisconnect,
  registerPrivyLogout,
  rememberWalletConnect,
  shouldAutoConnectWallet,
} from './wallet-session'

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed))
  const store: Storage = {
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
  return store
}

describe('wallet session disconnect', () => {
  afterEach(() => {
    registerPrivyLogout(null)
    vi.unstubAllGlobals()
  })

  function stubLogoutFetch() {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('clears walletName and disables autoConnect after explicit disconnect', async () => {
    const wallet = '8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk'
    const storage = memoryStorage({
      [WALLET_ADAPTER_STORAGE_KEY]: 'Phantom',
      [MOBILE_AUTH_CACHE_KEY]: '{"accounts":[]}',
      'crew.platform.v4': '{"coins":[]}',
    })
    writeWalletAuth({ wallet, expiresAt: Date.now() + 60_000 }, storage)
    expect(await shouldAutoConnectWallet(storage)).toBe(true)
    expect(isWalletAuthenticated(wallet, storage)).toBe(true)
    const fetchMock = stubLogoutFetch()

    await persistExplicitDisconnect(storage)

    expect(storage.getItem(WALLET_ADAPTER_STORAGE_KEY)).toBeNull()
    expect(storage.getItem(MOBILE_AUTH_CACHE_KEY)).toBeNull()
    expect(storage.getItem(WALLET_AUTH_STORAGE_KEY)).toBeNull()
    expect(isWalletAuthenticated(wallet, storage)).toBe(false)
    expect(fetchMock).toHaveBeenCalled()
    expect(String(fetchMock.mock.calls.flat()[0])).toMatch(/\/api\/wallet\/connect\/logout$/)
    expect(isUserDisconnected(storage)).toBe(true)
    expect(storage.getItem(USER_DISCONNECTED_KEY)).toBe('1')
    expect(await shouldAutoConnectWallet(storage)).toBe(false)
    expect(storage.getItem('crew.platform.v4')).toBe('{"coins":[]}')
  })

  it('does not autoConnect on a fresh session or after Disconnect until SIWS succeeds', async () => {
    const wallet = '8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk'
    const storage = memoryStorage({ [WALLET_ADAPTER_STORAGE_KEY]: 'Phantom' })
    stubLogoutFetch()
    expect(await shouldAutoConnectWallet(storage)).toBe(false)
    await persistExplicitDisconnect(storage)
    expect(await shouldAutoConnectWallet(storage)).toBe(false)
    rememberWalletConnect(storage)
    expect(isUserDisconnected(storage)).toBe(false)
    expect(await shouldAutoConnectWallet(storage)).toBe(false)
    writeWalletAuth({ wallet, expiresAt: Date.now() + 60_000 }, storage)
    expect(await shouldAutoConnectWallet(storage)).toBe(true)
  })

  it('clears Privy session keys and logs out when registered', async () => {
    const storage = memoryStorage({
      'privy:token': 'access',
      'privy-token': 'legacy',
      walletName: 'Phantom',
    })
    let loggedOut = false
    registerPrivyLogout(() => {
      loggedOut = true
    })
    stubLogoutFetch()

    await persistExplicitDisconnect(storage)

    expect(loggedOut).toBe(true)
    expect(storage.getItem('privy:token')).toBeNull()
    expect(storage.getItem('privy-token')).toBeNull()
    expect(storage.getItem('walletName')).toBeNull()
  })

  it('clears the pending-registration wallet and does not invent a crew_kol cookie', async () => {
    const session = memoryStorage({
      [PENDING_REG_KEY]: JSON.stringify({
        wallet: '8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk',
        startedAt: Date.now(),
      }),
    })
    const storage = memoryStorage({ walletName: 'Solflare' })
    stubLogoutFetch()
    await persistExplicitDisconnect(storage, session)
    expect(session.getItem(PENDING_REG_KEY)).toBeNull()
    expect(storage.getItem(WALLET_ADAPTER_STORAGE_KEY)).toBeNull()
    expect(storage.getItem('crew_kol')).toBeNull()
  })

  it('clears only Privy-prefixed keys', () => {
    const storage = memoryStorage({
      'privy:id-token': 'id',
      'privacy-pref': 'keep',
    })
    clearPrivySession(storage)
    expect(storage.getItem('privy:id-token')).toBeNull()
    expect(storage.getItem('privacy-pref')).toBe('keep')
  })
})
