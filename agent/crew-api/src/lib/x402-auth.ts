/**
 * Alternative agent auth: x402 payment OR existing API key.
 * API-key path is unchanged. x402 only runs when X402_ENABLED and no key header.
 */

import type { Request, Response, NextFunction } from 'express'
import { PublicKey } from '@solana/web3.js'
import { isEvmAddress } from './agent/evm-address.js'
import { getAgentKeyReferral, getAgentReferralByOwnerWallet } from './agent-referral.js'
import { readAgentKeyHeader, requireAgentApiKey, type AgentAuthContext } from './auth.js'
import {
  decodePaymentHeader,
  encodePaymentResponse,
  extractPayerFromPayload,
  getX402Facilitator,
  matchRequirements,
  paymentRequirementsFor,
  x402Fingerprint,
  x402KindForPath,
  x402Ready,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  type PaymentRequirements,
} from './x402.js'

const API_PUBLIC = (process.env.CREW_API_PUBLIC_URL || 'https://api.crewpay.dev').replace(/\/$/, '')

function resourceUrl(req: Request): string {
  const path = (req.originalUrl || req.url || req.path || '').split('?')[0] || '/'
  return `${API_PUBLIC}${path.startsWith('/') ? path : `/${path}`}`
}

function readPaymentHeader(req: Request): string {
  return (req.header(X_PAYMENT_HEADER) || req.header('PAYMENT-SIGNATURE') || '').trim()
}

function exposePaymentResponse(res: Response): void {
  const prev = String(res.getHeader('Access-Control-Expose-Headers') || '')
  const next = new Set(
    prev
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  next.add(X_PAYMENT_RESPONSE_HEADER)
  res.setHeader('Access-Control-Expose-Headers', [...next].join(', '))
}

function paymentRequiredBody(req: Request, extra?: { error?: string }) {
  const path = req.path || req.originalUrl || ''
  const accepts = paymentRequirementsFor({
    resource: resourceUrl(req),
    kind: x402KindForPath(path),
  })
  return {
    x402Version: 1,
    error:
      extra?.error ||
      'Payment Required — send X-PAYMENT (USDC on Base or Solana) or x-crew-api-key.',
    accepts,
    alternativeAuth: {
      header: 'x-crew-api-key',
      claim: 'POST https://api.crewpay.dev/api/agent/keys/claim',
    },
    docs: 'https://api.crewpay.dev/llms.txt',
  }
}

export function requireAgentApiKeyOrX402(
  req: Request,
  res: Response,
  next: NextFunction,
): void | Promise<void> {
  if (readAgentKeyHeader(req) || !x402Ready()) {
    return requireAgentApiKey(req, res, next)
  }
  return settleX402(req, res, next)
}

async function settleX402(req: Request, res: Response, next: NextFunction): Promise<void> {
  const accepts = paymentRequirementsFor({
    resource: resourceUrl(req),
    kind: x402KindForPath(req.path || req.originalUrl || ''),
  })
  if (!accepts.length) {
    void requireAgentApiKey(req, res, next)
    return
  }

  const raw = readPaymentHeader(req)
  if (!raw) {
    exposePaymentResponse(res)
    res.status(402).json(paymentRequiredBody(req))
    return
  }

  let payload
  try {
    payload = decodePaymentHeader(raw)
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Malformed X-PAYMENT header',
    })
    return
  }

  const selected = matchRequirements(payload, accepts)
  if (!selected) {
    exposePaymentResponse(res)
    res.status(402).json(
      paymentRequiredBody(req, {
        error: `Payment network/scheme does not match requirements (got ${payload.network}/${payload.scheme}).`,
      }),
    )
    return
  }

  const facilitator = getX402Facilitator()
  try {
    const verified = await facilitator.verify(payload, selected)
    if (!verified.isValid) {
      exposePaymentResponse(res)
      res.status(402).json(
        paymentRequiredBody(req, {
          error: verified.invalidReason || 'Payment verification failed',
        }),
      )
      return
    }
    const settled = await facilitator.settle(payload, selected)
    if (!settled.success) {
      exposePaymentResponse(res)
      res.status(402).json(
        paymentRequiredBody(req, {
          error: settled.errorReason || 'Payment settlement failed',
        }),
      )
      return
    }
    const payer =
      (settled.payer || verified.payer || extractPayerFromPayload(payload) || '').trim()
    if (!payer) {
      res.status(402).json(paymentRequiredBody(req, { error: 'Facilitator did not return a payer' }))
      return
    }
    exposePaymentResponse(res)
    res.setHeader(X_PAYMENT_RESPONSE_HEADER, encodePaymentResponse(settled))
    req.crewAgentAuth = x402AuthContext(payer, selected)
    next()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'facilitator error'
    res.status(502).json({
      ok: false,
      error: `x402 facilitator error: ${msg}`,
    })
  }
}

export function x402AuthContext(payer: string, selected: PaymentRequirements): AgentAuthContext {
  return {
    source: 'x402',
    fingerprint: x402Fingerprint(payer),
    payerWallet: payer,
    payerNetwork: selected.network === 'solana' ? 'solana' : 'base',
    launchesPerHour: 5,
    requireApproval: false,
  }
}

/**
 * Desk (15% launching-agent) wallet: x402 payer when the chain matches,
 * otherwise the launch signer pubkey.
 */
export function deskWalletFromAuth(
  auth: AgentAuthContext | undefined,
  fallback: string,
  chain: 'solana' | 'evm',
): string {
  const payer = auth?.payerWallet?.trim()
  if (auth?.source !== 'x402' || !payer) return fallback
  if (chain === 'evm') {
    return isEvmAddress(payer) ? payer : fallback
  }
  if (isEvmAddress(payer)) return fallback
  try {
    return new PublicKey(payer).toBase58()
  } catch {
    return fallback
  }
}

/** Referral bound on a claimed key that already owns this payer wallet, if any. */
export async function referralForAgentAuth(auth: AgentAuthContext | undefined) {
  if (!auth) return null
  if (auth.keyId) return getAgentKeyReferral(auth.keyId)
  if (auth.source === 'x402' && auth.payerWallet) {
    return getAgentReferralByOwnerWallet(auth.payerWallet)
  }
  return null
}
