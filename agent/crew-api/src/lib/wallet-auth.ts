/**
 * Optional wallet-signed board writes.
 * Client signs message: `crew-board:${mint}:${timestamp}` with Phantom,
 * sends headers x-crew-wallet, x-crew-timestamp, x-crew-signature (base58).
 */

import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { PublicKey } from '@solana/web3.js'
import type { Request, Response, NextFunction } from 'express'
import type { requireApiKey as RequireApiKey } from './auth.js'
import { createHash } from 'node:crypto'
import { consumeBoardNonce } from './board-nonces.js'

export function buildBoardMessage(mint: string, timestamp: number): string {
  return `crew-board:${mint}:${timestamp}`
}

export function buildBoardMessageV2(opts: {
  mint: string
  bodySha256Hex: string
  nonce: string
  timestamp: number
}): string {
  return `crew-board:${opts.mint}:${opts.bodySha256Hex}:${opts.nonce}:${opts.timestamp}`
}

export function buildKolReferralsMessage(wallet: string, timestamp: number): string {
  return `crew-kol-referrals:${wallet}:${timestamp}`
}

/** Verify Phantom-signed KOL referrals dashboard auth. */
export function kolReferralsWalletFresh(req: {
  header(name: string): string | undefined
}): { wallet: string } | null {
  const wallet = (req.header('x-crew-wallet') || '').trim()
  const tsRaw = (req.header('x-crew-timestamp') || '').trim()
  const signature = (req.header('x-crew-signature') || '').trim()
  if (!wallet || !tsRaw || !signature) return null
  const timestamp = Number(tsRaw)
  if (!Number.isFinite(timestamp)) return null
  if (Math.abs(Date.now() - timestamp) > 10 * 60_000) return null
  const message = buildKolReferralsMessage(wallet, timestamp)
  if (!verifyWalletSignature({ wallet, message, signatureBase58: signature })) return null
  return { wallet }
}

export function buildApproveDryRunMessage(dryRunId: string, timestamp: number): string {
  return `crew-approve-dry-run:${dryRunId}:${timestamp}`
}

export function buildRequireApprovalMessage(
  keyId: string,
  requireApproval: boolean,
  timestamp: number,
): string {
  return `crew-require-approval:${keyId}:${requireApproval ? '1' : '0'}:${timestamp}`
}

/** Operator wallet signature to toggle requireApproval (CREWPAY_APPROVER_WALLETS). */
export function requireApprovalWalletFresh(req: {
  header(name: string): string | undefined
  body?: unknown
}): { wallet: string; keyId: string; requireApproval: boolean } | null {
  const wallet = (req.header('x-crew-wallet') || '').trim()
  const tsRaw = (req.header('x-crew-timestamp') || '').trim()
  const signature = (req.header('x-crew-signature') || '').trim()
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
    keyId?: string
    requireApproval?: boolean
  }
  const keyId = (req.header('x-crew-key-id') || '').trim() || String(body.keyId || '')
  if (!wallet || !tsRaw || !signature || !keyId || typeof body.requireApproval !== 'boolean') {
    return null
  }
  const timestamp = Number(tsRaw)
  if (!Number.isFinite(timestamp)) return null
  if (Math.abs(Date.now() - timestamp) > 10 * 60_000) return null
  const message = buildRequireApprovalMessage(keyId, body.requireApproval, timestamp)
  if (!verifyWalletSignature({ wallet, message, signatureBase58: signature })) return null
  return { wallet, keyId, requireApproval: body.requireApproval }
}

/** Verify Phantom-signed dry-run approval headers (no mint). */
export function approveDryRunWalletFresh(req: {
  header(name: string): string | undefined
  body?: unknown
}): { wallet: string; dryRunId: string } | null {
  const wallet = (req.header('x-crew-wallet') || '').trim()
  const tsRaw = (req.header('x-crew-timestamp') || '').trim()
  const signature = (req.header('x-crew-signature') || '').trim()
  const dryRunId =
    (req.header('x-crew-dry-run-id') || '').trim() ||
    String((req.body as { dryRunId?: string } | undefined)?.dryRunId || '')
  if (!wallet || !tsRaw || !signature || !dryRunId) return null
  const timestamp = Number(tsRaw)
  if (!Number.isFinite(timestamp)) return null
  if (Math.abs(Date.now() - timestamp) > 10 * 60_000) return null
  const message = buildApproveDryRunMessage(dryRunId, timestamp)
  if (!verifyWalletSignature({ wallet, message, signatureBase58: signature })) return null
  return { wallet, dryRunId }
}

export function verifyWalletSignature(opts: {
  wallet: string
  message: string
  signatureBase58: string
}): boolean {
  try {
    const pubkey = new PublicKey(opts.wallet)
    const msg = new TextEncoder().encode(opts.message)
    const sig = bs58.decode(opts.signatureBase58)
    return nacl.sign.detached.verify(msg, sig, pubkey.toBytes())
  } catch {
    return false
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

export function canonicalBodySha256Hex(body: unknown): string {
  const sorted = sortKeys(body)
  const json = JSON.stringify(sorted)
  return createHash('sha256').update(json).digest('hex')
}

export function walletSignatureFresh(req: Request): {
  wallet: string
  mintHint?: string
} | null {
  const wallet = (req.header('x-crew-wallet') || '').trim()
  const tsRaw = (req.header('x-crew-timestamp') || '').trim()
  const signature = (req.header('x-crew-signature') || '').trim()
  const mintHint = (req.header('x-crew-mint') || '').trim()
  if (!wallet || !tsRaw || !signature) return null
  const timestamp = Number(tsRaw)
  if (!Number.isFinite(timestamp)) return null
  if (Math.abs(Date.now() - timestamp) > 10 * 60_000) return null
  const mint = mintHint || String((req.body as { mint?: string })?.mint || '')
  if (!mint) return null
  const message = buildBoardMessage(mint, timestamp)
  if (!verifyWalletSignature({ wallet, message, signatureBase58: signature })) return null
  return { wallet, mintHint: mint }
}

/** Verify v2 board write (nonce + canonical body hash). Consumes nonce on success. */
export async function walletBoardSignatureFreshV2(req: Request): Promise<{
  wallet: string
  mint: string
} | null> {
  const wallet = (req.header('x-crew-wallet') || '').trim()
  const tsRaw = (req.header('x-crew-timestamp') || '').trim()
  const signature = (req.header('x-crew-signature') || '').trim()
  const mint = (req.header('x-crew-mint') || '').trim() || String((req.body as { mint?: string })?.mint || '')
  const nonce = (req.header('x-crew-nonce') || '').trim()
  if (!wallet || !tsRaw || !signature || !mint || !nonce) return null
  const timestamp = Number(tsRaw)
  if (!Number.isFinite(timestamp)) return null
  if (Math.abs(Date.now() - timestamp) > 10 * 60_000) return null
  const bodyHash = canonicalBodySha256Hex(req.body)
  const message = buildBoardMessageV2({ mint, bodySha256Hex: bodyHash, nonce, timestamp })
  if (!verifyWalletSignature({ wallet, message, signatureBase58: signature })) return null
  const ok = await consumeBoardNonce(nonce, wallet)
  if (!ok) return null
  return { wallet, mint }
}

/** Middleware: API key OR wallet signature. */
export function requireApiKeyOrWallet(requireApiKeyMw: typeof RequireApiKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signed = walletSignatureFresh(req)
    if (signed) {
      ;(req as Request & { crewWallet?: string }).crewWallet = signed.wallet
      next()
      return
    }
    requireApiKeyMw(req, res, next)
  }
}

/** Middleware: wallet signature only (board writes). */
export function requireWalletSignatureOnly() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signed = await walletBoardSignatureFreshV2(req)
      if (!signed) {
        res.status(401).json({
          error:
            'Wallet signature required — headers x-crew-wallet, x-crew-timestamp, x-crew-signature, x-crew-nonce, x-crew-mint (message crew-board:{mint}:{sha256(body)}:{nonce}:{ts}).',
        })
        return
      }
      ;(req as Request & { crewWallet?: string }).crewWallet = signed.wallet
      next()
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'wallet auth failed' })
    }
  }
}
