/**
 * SIWS-style wallet connect: one-time nonce, signMessage, server verify.
 * Adapter connect() is not enough — Phantom/Solflare can reconnect silently.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { consumeBoardNonce, issueBoardNonce } from './board-nonces.js'
import { verifyWalletSignature } from './wallet-auth.js'

export const WALLET_CONNECT_COOKIE = 'crew_wallet'
export const WALLET_CONNECT_TTL_SEC = 12 * 60 * 60
export const CONNECT_MESSAGE_PREFIX = 'Sign in to CrewPay'

export type WalletConnectClaims = {
  v: 1
  w: string
  exp: number
}

export function connectMessage(wallet: string, nonce: string): string {
  return `${CONNECT_MESSAGE_PREFIX}\nWallet: ${wallet.trim()}\nNonce: ${nonce.trim()}`
}

export function walletSessionSecret(): string {
  return (
    process.env.WALLET_SESSION_SECRET?.trim() ||
    process.env.KOL_SESSION_SECRET?.trim() ||
    process.env.KOL_OAUTH_STATE_SECRET?.trim() ||
    process.env.X_CLIENT_SECRET?.trim() ||
    process.env.CREW_API_KEY?.trim() ||
    ''
  )
}

export async function issueConnectNonce(
  wallet: string,
): Promise<{ nonce: string; message: string; expiresAt: number }> {
  const address = wallet.trim()
  if (address.length < 32 || address.startsWith('0x')) {
    throw new Error('Invalid Solana wallet.')
  }
  const { nonce, expiresAt } = await issueBoardNonce(address)
  return { nonce, message: connectMessage(address, nonce), expiresAt }
}

export async function verifyConnectSignature(opts: {
  wallet: string
  nonce: string
  signature: string
}): Promise<{ wallet: string; expiresAt: number }> {
  const wallet = opts.wallet.trim()
  const nonce = opts.nonce.trim()
  if (wallet.length < 32 || wallet.startsWith('0x')) {
    throw new Error('Invalid Solana wallet.')
  }
  if (!/^[a-f0-9]{16,64}$/i.test(nonce)) {
    throw new Error('Invalid connect nonce.')
  }
  const message = connectMessage(wallet, nonce)
  if (!verifyWalletSignature({ wallet, message, signatureBase58: opts.signature.trim() })) {
    throw new Error('Invalid wallet signature.')
  }
  const consumed = await consumeBoardNonce(nonce, wallet)
  if (!consumed) {
    throw new Error('Connect nonce expired or already used. Sign in again.')
  }
  return { wallet, expiresAt: Date.now() + WALLET_CONNECT_TTL_SEC * 1000 }
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function hmac(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest()
}

function macEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function signWalletConnectSession(claims: WalletConnectClaims, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(claims), 'utf8'))
  const mac = b64url(hmac(secret, `wc1.${body}`))
  return `wc1.${body}.${mac}`
}

export function verifyWalletConnectSession(
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): { ok: true; claims: WalletConnectClaims } | { ok: false } {
  const parts = (token || '').trim().split('.')
  if (parts.length !== 3 || parts[0] !== 'wc1' || !parts[1] || !parts[2]) return { ok: false }
  if (!macEqual(fromB64url(parts[2]), hmac(secret, `wc1.${parts[1]}`))) return { ok: false }
  try {
    const c = JSON.parse(fromB64url(parts[1]).toString('utf8')) as Partial<WalletConnectClaims>
    if (c.v !== 1 || typeof c.w !== 'string' || c.w.length < 32 || typeof c.exp !== 'number') {
      return { ok: false }
    }
    if (nowSec >= c.exp) return { ok: false }
    return { ok: true, claims: { v: 1, w: c.w.trim(), exp: c.exp } }
  } catch {
    return { ok: false }
  }
}

export function issueWalletConnectToken(wallet: string, secret = walletSessionSecret()): string | null {
  if (!secret) return null
  const exp = Math.floor(Date.now() / 1000) + WALLET_CONNECT_TTL_SEC
  return signWalletConnectSession({ v: 1, w: wallet, exp }, secret)
}

export function walletConnectCookieHeader(token: string): string {
  return `${WALLET_CONNECT_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${WALLET_CONNECT_TTL_SEC}`
}

export function clearWalletConnectCookieHeader(): string {
  return `${WALLET_CONNECT_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}

export function readWalletConnectCookie(
  cookieHeader: string | undefined,
  secret = walletSessionSecret(),
): WalletConnectClaims | null {
  if (!secret) return null
  const match = String(cookieHeader || '').match(/(?:^|;)\s*crew_wallet=([^;]+)/)
  if (!match?.[1]) return null
  let token = match[1]
  try {
    token = decodeURIComponent(token)
  } catch {
    /* already decoded */
  }
  const verified = verifyWalletConnectSession(token, secret)
  return verified.ok ? verified.claims : null
}
