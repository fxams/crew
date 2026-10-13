/**
 * Wallet persistence for Connect / Disconnect.
 *
 * The Solana wallet adapter stores the last wallet in localStorage (`walletName`)
 * and auto-connects it on refresh. In-app Phantom/Solflare browsers also
 * auto-reconnect the injected provider. An explicit Disconnect must wipe that
 * state and refuse autoConnect until the user picks a wallet again.
 *
 * Intentionally not cleared: `crew_kol` (X KOL desk session) and board/UI keys.
 */

import { clearPendingRegistration } from './register-pending'

export const WALLET_ADAPTER_STORAGE_KEY = 'walletName'
export const USER_DISCONNECTED_KEY = 'crew_wallet_user_disconnected'
export const MOBILE_AUTH_CACHE_KEY = 'SolanaMobileWalletAdapterDefaultAuthorizationCache'

export const WALLET_PERSIST_KEYS = [
  WALLET_ADAPTER_STORAGE_KEY,
  MOBILE_AUTH_CACHE_KEY,
] as const

export type WalletStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & {
  key?: (index: number) => string | null
  length?: number
}

function localStore(): WalletStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function remove(storage: WalletStorage | null, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    /* private mode */
  }
}

function write(storage: WalletStorage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value)
  } catch {
    /* private mode */
  }
}

export function isUserDisconnected(storage: WalletStorage | null = localStore()): boolean {
  if (!storage) return false
  try {
    return storage.getItem(USER_DISCONNECTED_KEY) === '1'
  } catch {
    return false
  }
}

/** Call when the user explicitly picks a wallet so the next refresh may autoConnect. */
export function rememberWalletConnect(storage: WalletStorage | null = localStore()): void {
  remove(storage, USER_DISCONNECTED_KEY)
}

export function markUserDisconnected(storage: WalletStorage | null = localStore()): void {
  write(storage, USER_DISCONNECTED_KEY, '1')
}

export function clearWalletAdapterPersistence(storage: WalletStorage | null = localStore()): void {
  for (const key of WALLET_PERSIST_KEYS) remove(storage, key)
}

/** Privy embedded-wallet session (keys prefixed `privy`). */
export function clearPrivySession(storage: WalletStorage | null = localStore()): void {
  if (!storage) return
  const keys: string[] = []
  const length = Number(storage.length || 0)
  if (typeof storage.key === 'function' && length > 0) {
    for (let i = 0; i < length; i += 1) {
      const key = storage.key(i)
      if (key) keys.push(key)
    }
  } else if (typeof localStorage !== 'undefined' && storage === localStorage) {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key) keys.push(key)
    }
  }
  for (const key of keys) {
    if (/^privy(:|-|_)/i.test(key) || key.toLowerCase() === 'privy') remove(storage, key)
  }
}

export function clearAppWalletKeys(
  session: Pick<Storage, 'removeItem'> | null | undefined = undefined,
): void {
  clearPendingRegistration(session === undefined ? undefined : session)
}

let privyLogout: (() => Promise<void> | void) | null = null

export function registerPrivyLogout(fn: (() => Promise<void> | void) | null): void {
  privyLogout = fn
}

export async function logoutPrivyIfUsed(
  storage: WalletStorage | null = localStore(),
): Promise<void> {
  const fn = privyLogout
  if (fn) {
    try {
      await fn()
    } catch {
      /* session may already be gone */
    }
  }
  clearPrivySession(storage)
}

/**
 * Wallet adapter autoConnect callback. Returns false after an explicit
 * Disconnect so in-app browsers cannot silently reconnect.
 */
export async function shouldAutoConnectWallet(
  storage: WalletStorage | null = localStore(),
): Promise<boolean> {
  return !isUserDisconnected(storage)
}

/** Persist a user Disconnect: flag + adapter keys + Privy + pending wallet. */
export async function persistExplicitDisconnect(
  storage: WalletStorage | null = localStore(),
  session?: Pick<Storage, 'removeItem'> | null,
): Promise<void> {
  markUserDisconnected(storage)
  clearWalletAdapterPersistence(storage)
  clearAppWalletKeys(session)
  await logoutPrivyIfUsed(storage)
  // Adapter connect() may rewrite walletName during teardown — wipe again.
  clearWalletAdapterPersistence(storage)
}
