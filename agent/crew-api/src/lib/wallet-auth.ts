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

export function buildBoardMessage(mint: string, timestamp: number): string {
  return `crew-board:${mint}:${timestamp}`
}

export function buildApproveDryRunMessage(dryRunId: string, timestamp: number): string {
  return `crew-approve-dry-run:${dryRunId}:${timestamp}`
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
