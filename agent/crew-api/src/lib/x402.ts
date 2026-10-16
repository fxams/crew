/**
 * x402 (HTTP 402 pay-per-request) — Coinbase/x402 v2.
 *
 * Off unless X402_ENABLED is set. Speaks PAYMENT-REQUIRED / PAYMENT-SIGNATURE /
 * PAYMENT-RESPONSE (plus legacy X-PAYMENT / X-PAYMENT-RESPONSE) and
 * verifies/settles through a facilitator (default https://x402.org/facilitator).
 * No secrets live here — payTo addresses are public receiving wallets from env.
 */

import { createHash } from 'node:crypto'
import { isEvmAddress } from './agent/evm-address.js'
import { X402_NETWORK_BASE, X402_NETWORK_SOLANA } from './x402-discovery.js'

export const X402_VERSION = 2
export const X402_VERSION_V1 = 1
export const DEFAULT_X402_FACILITATOR_URL = 'https://x402.org/facilitator'
export const DEFAULT_X402_PRICE_LAUNCH_USD = 0.1
export const DEFAULT_X402_PRICE_AUTOHIRE_USD = 0.02

/** Circle USDC on Base mainnet. */
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
/** Circle USDC on Solana mainnet. */
export const USDC_SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export const X_PAYMENT_HEADER = 'X-PAYMENT'
export const X_PAYMENT_RESPONSE_HEADER = 'X-PAYMENT-RESPONSE'
export const PAYMENT_REQUIRED_HEADER = 'PAYMENT-REQUIRED'
export const PAYMENT_SIGNATURE_HEADER = 'PAYMENT-SIGNATURE'
export const PAYMENT_RESPONSE_HEADER = 'PAYMENT-RESPONSE'

export type X402Network = 'base' | 'solana'
export type X402CaipNetwork = typeof X402_NETWORK_BASE | typeof X402_NETWORK_SOLANA

export type PaymentRequirements = {
  scheme: 'exact'
  /** CAIP-2 (eip155:8453 / solana:…). */
  network: string
  /** Atomic USDC units (6 decimals). */
  amount: string
  /** v1 alias of amount — same atomic string, for legacy clients. */
  maxAmountRequired: string
  payTo: string
  maxTimeoutSeconds: number
  asset: string
  extra?: Record<string, string>
}

export type ResourceInfo = {
  url: string
  description?: string
  mimeType?: string
  serviceName?: string
  tags?: string[]
  iconUrl?: string
}

export type PaymentPayload = {
  x402Version: number
  scheme: string
  network: string
  payload: Record<string, unknown>
  accepted?: PaymentRequirements
  resource?: ResourceInfo
  extensions?: Record<string, unknown>
  /** Original decoded object posted to the facilitator. */
  raw?: Record<string, unknown>
}

export type VerifyResponse = {
  isValid: boolean
  invalidReason?: string | null
  payer?: string | null
}

export type SettleResponse = {
  success: boolean
  errorReason?: string | null
  transaction?: string
  network?: string
  payer?: string | null
}

export type X402Facilitator = {
  verify: (payload: PaymentPayload, requirements: PaymentRequirements) => Promise<VerifyResponse>
  settle: (payload: PaymentPayload, requirements: PaymentRequirements) => Promise<SettleResponse>
}

export type X402EndpointKind = 'launch' | 'autohire'

const TRUE = new Set(['1', 'true', 'yes', 'on'])

export function envFlag(name: string): boolean {
  return TRUE.has((process.env[name] || '').trim().toLowerCase())
}

export function x402Enabled(): boolean {
  return envFlag('X402_ENABLED')
}

export function x402FacilitatorUrl(): string {
  return (process.env.X402_FACILITATOR_URL || DEFAULT_X402_FACILITATOR_URL).replace(/\/$/, '')
}

export function x402PayToEvm(): string | null {
  const w = (
    process.env.X402_PAY_TO_EVM ||
    process.env.ZORA_TREASURY_ADDRESS ||
    process.env.CREW_BUYBACK_WALLET_EVM ||
    ''
  ).trim()
  return isEvmAddress(w) ? w : null
}

export function x402PayToSol(): string | null {
  const w = (process.env.X402_SOLANA_PAY_TO || process.env.X402_PAY_TO_SOL || '').trim()
  return w.length >= 32 ? w : null
}

function parseUsd(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback
  const n = Number(raw.trim().replace(/^\$/, ''))
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

export function x402PriceLaunchUsd(): number {
  return parseUsd(process.env.X402_PRICE_LAUNCH_USD, DEFAULT_X402_PRICE_LAUNCH_USD)
}

export function x402PriceAutohireUsd(): number {
  return parseUsd(process.env.X402_PRICE_AUTOHIRE_USD, DEFAULT_X402_PRICE_AUTOHIRE_USD)
}

export function usdToUsdcAtomic(usd: number): string {
  return String(Math.round(usd * 1_000_000))
}

/** Ready to accept x402 payments (flag on and at least one payTo). */
export function x402Ready(): boolean {
  return x402Enabled() && Boolean(x402PayToEvm() || x402PayToSol())
}

export function x402PriceUsdForKind(kind: X402EndpointKind): number {
  return kind === 'autohire' ? x402PriceAutohireUsd() : x402PriceLaunchUsd()
}

export function x402KindForPath(path: string): X402EndpointKind {
  return /autohire/i.test(path) ? 'autohire' : 'launch'
}

export function formatUsdPrice(usd: number): string {
  return `$${usd.toFixed(2)}`
}

/** Map CAIP-2 / v1 aliases to the identity chain used for fee-share desk wallet. */
export function x402NetworkFamily(network: string): X402Network {
  const n = network.trim().toLowerCase()
  if (n === 'solana' || n.startsWith('solana:')) return 'solana'
  return 'base'
}

export function networksEqual(a: string, b: string): boolean {
  const na = a.trim().toLowerCase()
  const nb = b.trim().toLowerCase()
  if (na === nb) return true
  const famA = x402NetworkFamily(na)
  const famB = x402NetworkFamily(nb)
  if (famA !== famB) return false
  const baseAliases = new Set(['base', X402_NETWORK_BASE.toLowerCase(), 'eip155:8453'])
  const solAliases = new Set(['solana', X402_NETWORK_SOLANA.toLowerCase()])
  if (famA === 'base') return baseAliases.has(na) && baseAliases.has(nb)
  return solAliases.has(na) && solAliases.has(nb)
}

export function paymentRequirementsFor(opts: {
  resource: string
  kind: X402EndpointKind
  description?: string
}): PaymentRequirements[] {
  const usd = x402PriceUsdForKind(opts.kind)
  const amount = usdToUsdcAtomic(usd)
  const out: PaymentRequirements[] = []
  const evm = x402PayToEvm()
  if (evm) {
    out.push({
      scheme: 'exact',
      network: X402_NETWORK_BASE,
      amount,
      maxAmountRequired: amount,
      payTo: evm,
      maxTimeoutSeconds: 60,
      asset: USDC_BASE,
      extra: { name: 'USD Coin', version: '2' },
    })
  }
  const sol = x402PayToSol()
  if (sol) {
    out.push({
      scheme: 'exact',
      network: X402_NETWORK_SOLANA,
      amount,
      maxAmountRequired: amount,
      payTo: sol,
      maxTimeoutSeconds: 60,
      asset: USDC_SOLANA,
    })
  }
  return out
}

export function x402PublicDiscovery() {
  const enabled = x402Ready()
  const launch = formatUsdPrice(x402PriceLaunchUsd())
  const autohire = formatUsdPrice(x402PriceAutohireUsd())
  const networks: X402Network[] = []
  if (enabled && x402PayToEvm()) networks.push('base')
  if (enabled && x402PayToSol()) networks.push('solana')
  return {
    enabled,
    spec: 'https://docs.x402.org',
    protocol: 'x402 v2',
    docs: 'https://crewpay.dev/llms.txt',
    integration: 'https://github.com/fxams/crew/blob/main/docs/integrations/x402.md',
    note: enabled
      ? [
          networks.includes('base') ? `USDC on Base (${X402_NETWORK_BASE})` : null,
          networks.includes('solana') ? `USDC on Solana (${X402_NETWORK_SOLANA})` : null,
        ]
          .filter(Boolean)
          .join(' · ') +
        '. Send PAYMENT-SIGNATURE (or legacy X-PAYMENT). Verify+settle via configured facilitator (CDP supports Solana exact). No API key required; x-crew-api-key still works.'
      : 'Off unless X402_ENABLED is set (plus X402_PAY_TO_EVM and/or X402_SOLANA_PAY_TO). Base payTo is env-driven (X402_PAY_TO_EVM, else ZORA_TREASURY_ADDRESS, else CREW_BUYBACK_WALLET_EVM). Omit X402_SOLANA_PAY_TO to advertise Base only.',
    headers: {
      request: PAYMENT_SIGNATURE_HEADER,
      response: PAYMENT_RESPONSE_HEADER,
      paymentRequired: PAYMENT_REQUIRED_HEADER,
      legacyRequest: X_PAYMENT_HEADER,
      legacyResponse: X_PAYMENT_RESPONSE_HEADER,
    },
    alternativeAuth: 'x-crew-api-key',
    facilitator: enabled ? x402FacilitatorUrl() : undefined,
    networks,
    caip2: {
      base: enabled && x402PayToEvm() ? X402_NETWORK_BASE : undefined,
      solana: enabled && x402PayToSol() ? X402_NETWORK_SOLANA : undefined,
    },
    asset: 'USDC',
    prices: {
      launch: launch,
      unsigned: launch,
      submit: launch,
      dryRun: launch,
      autohire,
    },
    endpoints: [
      'POST /api/agent/launch/unsigned',
      'POST /api/agent/launch/submit',
      'POST /api/agent/launch/dry-run',
      'POST /api/agent/launch',
      'POST /api/agent/autohire',
    ],
    identity:
      'Payer wallet is the agent identity (15% launching-agent share when the chain matches; referral bound if that wallet already owns a referred key).',
    feeMap: '60% to the KOL crew, 15% to the launching agent, 25% to the treasury',
  }
}

function asReq(raw: unknown): PaymentRequirements | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const amount = String(r.amount || r.maxAmountRequired || '')
  if (!amount || !r.payTo) return undefined
  return {
    scheme: (String(r.scheme || 'exact') as 'exact') || 'exact',
    network: String(r.network || ''),
    amount,
    maxAmountRequired: amount,
    payTo: String(r.payTo),
    maxTimeoutSeconds: Number(r.maxTimeoutSeconds || 60),
    asset: String(r.asset || ''),
    extra:
      r.extra && typeof r.extra === 'object'
        ? (r.extra as Record<string, string>)
        : undefined,
  }
}

export function decodePaymentHeader(raw: string): PaymentPayload {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('empty payment header')
  let json: string
  try {
    json = Buffer.from(trimmed, 'base64').toString('utf8')
  } catch {
    throw new Error('PAYMENT-SIGNATURE is not valid base64')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('PAYMENT-SIGNATURE is not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('payment payload must be an object')
  const p = parsed as Record<string, unknown>
  const payload = p.payload
  if (!payload || typeof payload !== 'object') throw new Error('payment payload missing payload')
  const accepted = asReq(p.accepted)
  const version = Number(p.x402Version || 0)
  const network =
    accepted?.network ||
    String(p.network || '')
  const scheme = accepted?.scheme || String(p.scheme || 'exact')
  const resource =
    p.resource && typeof p.resource === 'object'
      ? (p.resource as ResourceInfo)
      : undefined
  const extensions =
    p.extensions && typeof p.extensions === 'object'
      ? (p.extensions as Record<string, unknown>)
      : undefined
  return {
    x402Version: version || (accepted ? X402_VERSION : X402_VERSION_V1),
    scheme,
    network,
    payload: payload as Record<string, unknown>,
    accepted,
    resource,
    extensions,
    raw: p,
  }
}

export function encodePaymentRequired(body: unknown): string {
  return Buffer.from(JSON.stringify(body), 'utf8').toString('base64')
}

export function encodePaymentResponse(settle: SettleResponse): string {
  return Buffer.from(JSON.stringify(settle), 'utf8').toString('base64')
}

export function extractPayerFromPayload(payload: PaymentPayload): string | null {
  const inner = payload.payload
  const auth = inner.authorization
  if (auth && typeof auth === 'object' && auth && 'from' in auth) {
    const from = String((auth as { from?: unknown }).from || '').trim()
    if (from) return from
  }
  for (const key of ['payer', 'from', 'signer', 'authority'] as const) {
    const v = inner[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

export function matchRequirements(
  payload: PaymentPayload,
  accepts: PaymentRequirements[],
): PaymentRequirements | null {
  const network = (payload.accepted?.network || payload.network || '').trim()
  const scheme = (payload.accepted?.scheme || payload.scheme || 'exact').trim().toLowerCase()
  if (!network) return null
  return (
    accepts.find((a) => networksEqual(a.network, network) && a.scheme === scheme) ||
    accepts.find((a) => networksEqual(a.network, network)) ||
    null
  )
}

export function x402Fingerprint(payer: string): string {
  return createHash('sha256').update(`x402:${payer.trim().toLowerCase()}`).digest('hex').slice(0, 16)
}

async function postFacilitator<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { raw: text.slice(0, 300) }
    }
    if (!res.ok) {
      const msg =
        typeof json === 'object' && json && 'error' in json
          ? String((json as { error: unknown }).error)
          : text.slice(0, 200)
      throw new Error(`facilitator ${path} HTTP ${res.status}: ${msg || res.statusText}`)
    }
    return json as T
  } finally {
    clearTimeout(timer)
  }
}

/**
 * v1 facilitator expects network `base`/`solana` + maxAmountRequired.
 * v2 expects CAIP-2 + amount. Match the payload version.
 */
function requirementsForFacilitator(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Record<string, unknown> {
  if ((payload.x402Version || X402_VERSION) >= 2) {
    return {
      scheme: requirements.scheme,
      network: requirements.network,
      amount: requirements.amount,
      asset: requirements.asset,
      payTo: requirements.payTo,
      maxTimeoutSeconds: requirements.maxTimeoutSeconds,
      extra: requirements.extra,
    }
  }
  return {
    scheme: requirements.scheme,
    network: x402NetworkFamily(requirements.network),
    maxAmountRequired: requirements.maxAmountRequired || requirements.amount,
    payTo: requirements.payTo,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds,
    asset: requirements.asset,
    extra: requirements.extra,
    mimeType: 'application/json',
  }
}

/** Default HTTP facilitator. Tests inject a mock via createHttpFacilitator(url, fetch). */
export function createHttpFacilitator(
  url: string = x402FacilitatorUrl(),
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): X402Facilitator {
  const base = url.replace(/\/$/, '')
  return {
    async verify(payload, requirements) {
      const json = await postFacilitator<VerifyResponse>(
        base,
        '/verify',
        {
          x402Version: payload.x402Version || X402_VERSION,
          paymentPayload: payload.raw || payload,
          paymentRequirements: requirementsForFacilitator(payload, requirements),
        },
        fetchImpl,
      )
      return {
        isValid: Boolean(json?.isValid),
        invalidReason: json?.invalidReason ?? null,
        payer: json?.payer ?? null,
      }
    },
    async settle(payload, requirements) {
      const json = await postFacilitator<SettleResponse>(
        base,
        '/settle',
        {
          x402Version: payload.x402Version || X402_VERSION,
          paymentPayload: payload.raw || payload,
          paymentRequirements: requirementsForFacilitator(payload, requirements),
        },
        fetchImpl,
      )
      return {
        success: Boolean(json?.success),
        errorReason: json?.errorReason ?? null,
        transaction: json?.transaction,
        network: json?.network,
        payer: json?.payer ?? null,
      }
    },
  }
}

let injectedFacilitator: X402Facilitator | null = null

/** Test hook — swap the facilitator without hitting the network. */
export function setX402FacilitatorForTests(fac: X402Facilitator | null): void {
  injectedFacilitator = fac
}

export function getX402Facilitator(): X402Facilitator {
  return injectedFacilitator || createHttpFacilitator()
}
