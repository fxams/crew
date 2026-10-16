/**
 * Alternative agent auth: x402 payment OR existing API key.
 * API-key path is unchanged. x402 only runs when X402_ENABLED and no key header.
 */

import type { Request, Response, NextFunction } from 'express'
import { PublicKey } from '@solana/web3.js'
import { isEvmAddress } from './agent/evm-address.js'
import { isSuiAddress } from './agent/sui-address.js'
import { getAgentKeyReferral, getAgentReferralByOwnerWallet } from './agent-referral.js'
import { readAgentKeyHeader, requireAgentApiKey, type AgentAuthContext } from './auth.js'
import {
  decodePaymentHeader,
  encodePaymentRequired,
  encodePaymentResponse,
  extractPayerFromPayload,
  getX402Facilitator,
  matchRequirements,
  paymentRequirementsFor,
  x402Fingerprint,
  x402KindForPath,
  x402NetworkFamily,
  x402Ready,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  X402_VERSION,
  type PaymentRequirements,
} from './x402.js'
import {
  bazaarExtensionFor,
  paidX402RouteForPath,
  resourceInfoFor,
} from './x402-discovery.js'

const API_PUBLIC = (process.env.CREW_API_PUBLIC_URL || 'https://api.crewpay.dev').replace(/\/$/, '')

function resourceUrl(req: Request): string {
  const path = (req.originalUrl || req.url || req.path || '').split('?')[0] || '/'
  return `${API_PUBLIC}${path.startsWith('/') ? path : `/${path}`}`
}

function requestPath(req: Request): string {
  return (req.originalUrl || req.url || req.path || '').split('?')[0] || '/'
}

function readPaymentHeader(req: Request): string {
  return (
    req.header(PAYMENT_SIGNATURE_HEADER) ||
    req.header(X_PAYMENT_HEADER) ||
    req.header('PAYMENT-SIGNATURE') ||
    ''
  ).trim()
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
  next.add(PAYMENT_RESPONSE_HEADER)
  next.add(PAYMENT_REQUIRED_HEADER)
  res.setHeader('Access-Control-Expose-Headers', [...next].join(', '))
}

export function paymentRequiredBody(req: Request, extra?: { error?: string }) {
  const path = requestPath(req)
  const url = resourceUrl(req)
  const route = paidX402RouteForPath(path)
  const accepts = paymentRequirementsFor({
    resource: url,
    kind: route.kind,
  })
  const resource = resourceInfoFor(route, url)
  return {
    x402Version: X402_VERSION,
    error:
      extra?.error ||
      'Payment Required — send PAYMENT-SIGNATURE (USDC on Base eip155:8453) or x-crew-api-key.',
    resource,
    accepts,
    extensions: {
      bazaar: bazaarExtensionFor(route),
    },
    alternativeAuth: {
      header: 'x-crew-api-key',
      claim: 'POST https://api.crewpay.dev/api/agent/keys/claim',
    },
    docs: 'https://api.crewpay.dev/llms.txt',
  }
}

function send402(req: Request, res: Response, extra?: { error?: string }) {
  const body = paymentRequiredBody(req, extra)
  exposePaymentResponse(res)
  res.setHeader(PAYMENT_REQUIRED_HEADER, encodePaymentRequired(body))
  res.status(402).json(body)
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
    kind: x402KindForPath(requestPath(req)),
  })
  if (!accepts.length) {
    void requireAgentApiKey(req, res, next)
    return
  }

  const raw = readPaymentHeader(req)
  if (!raw) {
    send402(req, res)
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
    send402(req, res, {
      error: `Payment network/scheme does not match requirements (got ${payload.network}/${payload.scheme}).`,
    })
    return
  }

  const facilitator = getX402Facilitator()
  try {
    const verified = await facilitator.verify(payload, selected)
    if (!verified.isValid) {
      send402(req, res, {
        error: verified.invalidReason || 'Payment verification failed',
      })
      return
    }
    const settled = await facilitator.settle(payload, selected)
    if (!settled.success) {
      send402(req, res, {
        error: settled.errorReason || 'Payment settlement failed',
      })
      return
    }
    const payer =
      (settled.payer || verified.payer || extractPayerFromPayload(payload) || '').trim()
    if (!payer) {
      send402(req, res, { error: 'Facilitator did not return a payer' })
      return
    }
    exposePaymentResponse(res)
    const encoded = encodePaymentResponse(settled)
    res.setHeader(X_PAYMENT_RESPONSE_HEADER, encoded)
    res.setHeader(PAYMENT_RESPONSE_HEADER, encoded)
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
    payerNetwork: x402NetworkFamily(selected.network),
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
  chain: 'solana' | 'evm' | 'sui',
): string {
  const payer = auth?.payerWallet?.trim()
  if (auth?.source !== 'x402' || !payer) return fallback
  if (chain === 'sui') {
    return isSuiAddress(payer) ? payer : fallback
  }
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
