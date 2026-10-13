/**
 * App-level Solana auth. Adapter publicKey is not enough: Phantom/Solflare
 * reconnect silently after Disconnect. A verified SIWS session is required.
 */

import bs58 from 'bs58'

export const WALLET_AUTH_STORAGE_KEY = 'crew_wallet_auth'
export const CONNECT_MESSAGE_PREFIX = 'Sign in to CrewPay'

export type WalletAuthRecord = {
  wallet: string
  expiresAt: number
}

export type WalletStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const API = (
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '')) ||
  'https://api.crewpay.dev'
)

function localStore(): WalletStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function connectMessage(wallet: string, nonce: string): string {
  return `${CONNECT_MESSAGE_PREFIX}\nWallet: ${wallet.trim()}\nNonce: ${nonce.trim()}`
}

export function parseWalletAuth(
  raw: string | null | undefined,
  now = Date.now(),
): WalletAuthRecord | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as Partial<WalletAuthRecord>
    const wallet = typeof parsed.wallet === 'string' ? parsed.wallet.trim() : ''
    const expiresAt = Number(parsed.expiresAt)
    if (wallet.length < 32 || wallet.startsWith('0x') || !Number.isFinite(expiresAt)) return null
    if (expiresAt <= now) return null
    return { wallet, expiresAt }
  } catch {
    return null
  }
}

export function readWalletAuth(
  storage: WalletStorage | null = localStore(),
  now = Date.now(),
): WalletAuthRecord | null {
  if (!storage) return null
  try {
    const record = parseWalletAuth(storage.getItem(WALLET_AUTH_STORAGE_KEY), now)
    if (!record) {
      storage.removeItem(WALLET_AUTH_STORAGE_KEY)
      return null
    }
    return record
  } catch {
    return null
  }
}

export function writeWalletAuth(
  record: WalletAuthRecord,
  storage: WalletStorage | null = localStore(),
): void {
  try {
    storage?.setItem(WALLET_AUTH_STORAGE_KEY, JSON.stringify(record))
  } catch {
    /* private mode */
  }
}

export function clearWalletAuth(storage: WalletStorage | null = localStore()): void {
  try {
    storage?.removeItem(WALLET_AUTH_STORAGE_KEY)
  } catch {
    /* private mode */
  }
}

export function isWalletAuthenticated(
  address: string | null | undefined,
  storage: WalletStorage | null = localStore(),
  now = Date.now(),
): boolean {
  const want = (address || '').trim()
  if (want.length < 32) return false
  const record = readWalletAuth(storage, now)
  return Boolean(record && record.wallet === want)
}

/**
 * Adapter publicKey / adapter.connected is not app auth.
 * After Disconnect (or a fresh session) this is true until SIWS verify succeeds.
 */
export function needsFreshWalletSignature(
  address: string | null | undefined,
  storage: WalletStorage | null = localStore(),
  now = Date.now(),
): boolean {
  return !isWalletAuthenticated(address, storage, now)
}

/**
 * Connect step after adapter.connect() — including trusted in-app wallets
 * that skip the connect prompt. Always sign unless a verified session exists.
 */
export async function completeSolanaAppConnect(opts: {
  wallet: string
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>
  alreadyAuthenticated: boolean
  authenticate: (args: {
    wallet: string
    signMessage: (message: Uint8Array) => Promise<Uint8Array>
  }) => Promise<unknown>
}): Promise<'signed' | 'reused-session'> {
  const wallet = opts.wallet.trim()
  if (wallet.length < 32) throw new Error('Wallet did not return a public key.')
  if (opts.alreadyAuthenticated) return 'reused-session'
  if (!opts.signMessage) {
    throw new Error('This wallet cannot sign a message. Open crewpay.dev in Phantom or Solflare.')
  }
  await opts.authenticate({ wallet, signMessage: opts.signMessage })
  return 'signed'
}

export async function logoutWalletAuth(
  storage: WalletStorage | null = localStore(),
): Promise<void> {
  clearWalletAuth(storage)
  try {
    await fetch(`${API}/api/wallet/connect/logout`, {
      method: 'POST',
      credentials: 'include',
    })
  } catch {
    /* cookie clear is best-effort */
  }
}

export async function hydrateWalletAuth(
  storage: WalletStorage | null = localStore(),
): Promise<WalletAuthRecord | null> {
  const local = readWalletAuth(storage)
  try {
    const res = await fetch(`${API}/api/wallet/connect/me`, { credentials: 'include' })
    if (!res.ok) return local
    const body = (await res.json()) as { wallet?: string; expiresAt?: string }
    const wallet = (body.wallet || '').trim()
    const expiresAt = Date.parse(String(body.expiresAt || ''))
    if (wallet.length < 32 || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return local
    const record = { wallet, expiresAt }
    writeWalletAuth(record, storage)
    return record
  } catch {
    return local
  }
}

export async function authenticateWallet(opts: {
  wallet: string
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  storage?: WalletStorage | null
}): Promise<WalletAuthRecord> {
  const wallet = opts.wallet.trim()
  if (wallet.length < 32) throw new Error('Invalid Solana wallet.')
  const nonceRes = await fetch(`${API}/api/wallet/connect/nonce`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })
  const nonceBody = (await nonceRes.json()) as { message?: string; nonce?: string; error?: string }
  if (!nonceRes.ok || !nonceBody.message || !nonceBody.nonce) {
    throw new Error(nonceBody.error || 'Could not start wallet sign-in.')
  }
  const expected = connectMessage(wallet, nonceBody.nonce)
  if (nonceBody.message !== expected) {
    throw new Error('Connect nonce did not match this wallet.')
  }
  const signature = await opts.signMessage(new TextEncoder().encode(nonceBody.message))
  const verifyRes = await fetch(`${API}/api/wallet/connect/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      wallet,
      nonce: nonceBody.nonce,
      signature: bs58.encode(signature),
    }),
  })
  const verifyBody = (await verifyRes.json()) as {
    wallet?: string
    expiresAt?: string
    error?: string
  }
  if (!verifyRes.ok || !verifyBody.wallet) {
    throw new Error(verifyBody.error || 'Wallet signature was rejected.')
  }
  const expiresAt = Date.parse(String(verifyBody.expiresAt || '')) || Date.now() + 12 * 60 * 60_000
  const record = { wallet: verifyBody.wallet, expiresAt }
  writeWalletAuth(record, opts.storage === undefined ? localStore() : opts.storage)
  return record
}
