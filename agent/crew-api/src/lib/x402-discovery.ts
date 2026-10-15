/**
 * x402 v2 discovery: Bazaar extension, OpenAPI x-payment-info, /.well-known/x402.
 * Copy is plain-language CrewPay use case — no earnings promises, no partnership claims.
 * payTo is never hardcoded here; it stays env-driven in x402.ts.
 */

import { AGENT_EXAMPLES } from './agent/errors.js'

export type DiscoveryEndpointKind = 'launch' | 'autohire'

export const API_PUBLIC_URL = (process.env.CREW_API_PUBLIC_URL || 'https://api.crewpay.dev').replace(
  /\/$/,
  '',
)
export const SITE_PUBLIC_URL = (process.env.SITE_URL || 'https://crewpay.dev').replace(/\/$/, '')

/** CAIP-2 Base mainnet. */
export const X402_NETWORK_BASE = 'eip155:8453'
/** CAIP-2 Solana mainnet. */
export const X402_NETWORK_SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'

export const X402_SERVICE_NAME = 'CrewPay'
export const X402_SERVICE_TAGS = ['kol', 'launch', 'crewpay', 'x402', 'agents'] as const
export const X402_ICON_URL = `${SITE_PUBLIC_URL}/favicon.png`
export const CREWPAY_CONTACT_EMAIL = 'crewpay@mail.grokbot.com'

/** Short product blurb for OpenAPI / x402scan / Bazaar. */
export const CREWPAY_USE_CASE =
  'AI agents launch coins on Pump.fun, Bags and Zora and auto-hire a crew of real KOLs, paid onchain from creator fees (60% crew / 15% agent / 25% treasury). Non-custodial.'

export type PaidX402Route = {
  path: string
  method: 'POST'
  kind: DiscoveryEndpointKind
  summary: string
  /** Route-specific what-it-does, always preceded by the product use case. */
  description: string
  inputExample: Record<string, unknown>
  inputSchema: Record<string, unknown>
  outputExample: Record<string, unknown>
  outputSchema: Record<string, unknown>
}

const autohireInputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: 32, description: 'Coin name used to match KOL narrative.' },
    ticker: { type: 'string', maxLength: 13, description: 'Ticker symbol.' },
    description: {
      type: 'string',
      maxLength: 204,
      description: 'Short coin vibe. Used only to match public KOL profiles.',
    },
    seats: {
      type: 'integer',
      minimum: 1,
      maximum: 20,
      default: 5,
      description: 'How many KOL seats to preview. Clamped to the live fee-map cap.',
    },
    optInOnly: {
      type: 'boolean',
      default: false,
      description: 'If true, restrict matches to registered KOLs. Default off.',
    },
  },
} as const

const launchInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'ticker'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 32, description: 'Coin name.' },
    ticker: { type: 'string', minLength: 2, maxLength: 13, description: 'Ticker.' },
    description: { type: 'string', maxLength: 204, description: 'User vibe (≤204 chars).' },
    imageUrl: { type: 'string', format: 'uri', description: 'Public PNG/JPEG/WebP/GIF URL.' },
    imageBase64: { type: 'string', description: 'Raw image bytes as base64 (alternative to imageUrl).' },
    platform: {
      type: 'string',
      enum: ['pumpfun', 'bags', 'zora'],
      default: 'pumpfun',
      description: 'Launch venue. pumpfun and bags are Solana; zora is Base.',
    },
    launcherPubkey: {
      type: 'string',
      description: 'Address that will sign. Required for pumpfun/bags. Zora may use the paying wallet.',
    },
    autoHire: {
      description: 'true | seats number | { seats }. Fallback when crew[] is omitted.',
    },
    crew: {
      type: 'array',
      description: 'Explicit KOL crew. Prefer this over Autohire. Shares must total 100.',
      items: { type: 'object' },
    },
    seats: { type: 'integer', minimum: 1, maximum: 20 },
    optInOnly: { type: 'boolean' },
    initialBuySol: { type: 'number', minimum: 0, maximum: 10 },
    twitter: { type: 'string', maxLength: 128 },
    website: { type: 'string', maxLength: 256 },
    mintPubkey: { type: 'string' },
    treasuryBps: { type: 'integer', minimum: 2000, maximum: 3000 },
  },
} as const

const submitInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['signed'],
  properties: {
    signed: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: { type: 'string' },
      description: 'Signed transactions from POST /api/agent/launch/unsigned (base64 Solana or 0x EVM).',
    },
    platform: {
      type: 'string',
      enum: ['pumpfun', 'bags', 'zora'],
      default: 'pumpfun',
    },
  },
} as const

const autohireOutputSchema = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    seats: { type: 'integer' },
    hires: { type: 'array', items: { type: 'object' } },
    crew: { type: 'array' },
    feeMap: { type: 'string' },
    disclaimer: { type: 'string' },
  },
} as const

const unsignedOutputSchema = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    platform: { type: 'string' },
    steps: { type: 'array' },
    crew: { type: 'array' },
    shareholders: { type: 'array' },
    feeMap: { type: 'string' },
    note: { type: 'string' },
  },
} as const

function withUseCase(routeWhat: string): string {
  return `${CREWPAY_USE_CASE} ${routeWhat}`
}

export function paidX402Routes(): PaidX402Route[] {
  return [
    {
      path: '/api/agent/autohire',
      method: 'POST',
      kind: 'autohire',
      summary: 'Preview a KOL crew for a coin (no on-chain tx)',
      description: withUseCase(
        'Preview a KOL crew for a coin. No launch, no custody, no payout in this call.',
      ),
      inputExample: { ...AGENT_EXAMPLES.autohire },
      inputSchema: autohireInputSchema,
      outputExample: {
        ok: true,
        seats: 5,
        hires: [
          {
            handle: '@example_kol',
            wallet: 'ExampleKol111111111111111111111111111111111',
            share: 20,
            role: 'kol',
          },
        ],
        feeMap: '60% to the KOL crew, 15% to the launching agent, 25% to the treasury',
        disclaimer:
          'Autohire matches public Pump.fun profiles by narrative. Wallets are not opt-in partners.',
      },
      outputSchema: autohireOutputSchema,
    },
    {
      path: '/api/agent/launch/unsigned',
      method: 'POST',
      kind: 'launch',
      summary: 'Build unsigned launch transactions (non-custodial)',
      description: withUseCase(
        'Build unsigned Pump.fun / Bags / Zora transactions. Sign locally. CrewPay never holds the launcher key.',
      ),
      inputExample: {
        ...AGENT_EXAMPLES.launch,
        launcherPubkey: 'Launcher11111111111111111111111111111111111',
        platform: 'pumpfun',
      },
      inputSchema: launchInputSchema,
      outputExample: {
        ok: true,
        platform: 'pumpfun',
        steps: [{ action: 'sign', encoding: 'base64' }],
        feeMap: '60% to the KOL crew, 15% to the launching agent, 25% to the treasury',
        note: 'Sign locally, then POST /api/agent/launch/submit. CrewPay never holds the key.',
      },
      outputSchema: unsignedOutputSchema,
    },
    {
      path: '/api/agent/launch/submit',
      method: 'POST',
      kind: 'launch',
      summary: 'Broadcast signed launch transactions',
      description: withUseCase(
        'Broadcast transactions you already signed. CrewPay does not sign for you.',
      ),
      inputExample: {
        signed: ['<signed-tx-base64>'],
        platform: 'pumpfun',
      },
      inputSchema: submitInputSchema,
      outputExample: {
        ok: true,
        signatures: ['<tx-signature>'],
        feeShareLocked: true,
      },
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          signatures: { type: 'array', items: { type: 'string' } },
          feeShareLocked: { type: 'boolean' },
        },
      },
    },
    {
      path: '/api/agent/launch/dry-run',
      method: 'POST',
      kind: 'launch',
      summary: 'Validate a launch plan without spending',
      description: withUseCase(
        'Validate a launch plan and image. Returns dryRunId. Spends nothing.',
      ),
      inputExample: {
        ...AGENT_EXAMPLES.launch,
        launcherPubkey: 'Launcher11111111111111111111111111111111111',
      },
      inputSchema: launchInputSchema,
      outputExample: {
        ok: true,
        dryRunId: 'dry_example',
        approvalUrl: 'https://crewpay.dev/approve/dry_example',
        feeMap: '60% to the KOL crew, 15% to the launching agent, 25% to the treasury',
      },
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          dryRunId: { type: 'string' },
          approvalUrl: { type: 'string' },
          plan: { type: 'object' },
          feeMap: { type: 'string' },
        },
      },
    },
    {
      path: '/api/agent/launch',
      method: 'POST',
      kind: 'launch',
      summary: 'Launch a coin with KOL fee-shares (mainnet)',
      description: withUseCase(
        'Create the coin and lock on-chain creator fee-shares. Send x-launcher-key from your backend or local MCP env — never as a body field.',
      ),
      inputExample: { ...AGENT_EXAMPLES.launch },
      inputSchema: launchInputSchema,
      outputExample: {
        ok: true,
        mint: 'Mint111111111111111111111111111111111111111',
        feeShareLocked: true,
        feeMap: '60% to the KOL crew, 15% to the launching agent, 25% to the treasury',
      },
      outputSchema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          mint: { type: 'string' },
          feeShareLocked: { type: 'boolean' },
          feeMap: { type: 'string' },
        },
      },
    },
  ]
}

export function paidX402RouteForPath(path: string): PaidX402Route {
  const routes = paidX402Routes()
  const normalized = path.split('?')[0] || path
  const found = routes.find((r) => normalized === r.path || normalized.endsWith(r.path))
  return found || routes.find((r) => r.kind === (/autohire/i.test(normalized) ? 'autohire' : 'launch')) || routes[0]!
}

export type BazaarExtension = {
  info: {
    description: string
    input: {
      type: 'http'
      method: 'POST'
      bodyType: 'json'
      body: Record<string, unknown>
    }
    output: {
      type: 'json'
      example: Record<string, unknown>
    }
  }
  schema: Record<string, unknown>
}

/** x402 v2 bazaar extension: info + JSON Schema for input/output (Draft 2020-12). */
export function bazaarExtensionFor(route: PaidX402Route): BazaarExtension {
  return {
    info: {
      description: route.description,
      input: {
        type: 'http',
        method: 'POST',
        bodyType: 'json',
        body: route.inputExample,
      },
      output: {
        type: 'json',
        example: route.outputExample,
      },
    },
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['description', 'input'],
      properties: {
        description: { type: 'string' },
        input: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'method', 'bodyType', 'body'],
          properties: {
            type: { type: 'string', const: 'http' },
            method: { type: 'string', enum: ['POST', 'PUT', 'PATCH'] },
            bodyType: { type: 'string', enum: ['json', 'form-data', 'text'] },
            body: route.inputSchema,
            queryParams: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            headers: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
        },
        output: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string' },
            example: route.outputSchema,
          },
        },
      },
    },
  }
}

export function resourceInfoFor(route: PaidX402Route, url: string) {
  return {
    url,
    description: route.description,
    mimeType: 'application/json',
    serviceName: X402_SERVICE_NAME,
    tags: [...X402_SERVICE_TAGS],
    iconUrl: X402_ICON_URL,
  }
}

/** OpenAPI x-payment-info amount as a decimal USD string (not atomic). */
export function xPaymentInfoUsdAmount(usd: number): string {
  return Number.isInteger(usd) ? String(usd) : usd.toFixed(2)
}

export function openApiXPaymentInfo(usd: number) {
  return {
    protocols: ['x402'],
    price: {
      mode: 'fixed',
      currency: 'USD',
      amount: xPaymentInfoUsdAmount(usd),
    },
  }
}

function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`
}

export function wellKnownX402(opts?: {
  apiUrl?: string
  launchUsd?: number
  autohireUsd?: number
}) {
  const api = (opts?.apiUrl || API_PUBLIC_URL).replace(/\/$/, '')
  const routes = paidX402Routes()
  const launchUsd = opts?.launchUsd
  const autohireUsd = opts?.autohireUsd
  const priceNote =
    launchUsd != null && autohireUsd != null
      ? `Prices: Autohire ${formatUsd(autohireUsd)} · launch family ${formatUsd(launchUsd)} (env-overridable, unchanged fee map).`
      : 'Prices stay the configured x402 launch/autohire amounts (env-overridable, unchanged fee map).'
  return {
    version: 1,
    description: CREWPAY_USE_CASE,
    contact: { email: CREWPAY_CONTACT_EMAIL },
    instructions: [
      CREWPAY_USE_CASE,
      `Pay-per-call x402 v2 on Base mainnet USDC (${X402_NETWORK_BASE}). Amounts are atomic USDC (6 decimals). Alternative auth: x-crew-api-key.`,
      'Probe a listed resource with POST (no API key, no body required) to read the 402 PAYMENT-REQUIRED challenge.',
      'Hosted MCP (mcp.crewpay.dev) is not an x402 resource server — it uses API keys. Local crewpay-mcp can pay the REST routes below.',
      priceNote,
    ].join(' '),
    resources: routes.map((r) => `${api}${r.path}`),
    methods: Object.fromEntries(routes.map((r) => [`${api}${r.path}`, r.method])),
    openapi: `${api}/openapi.json`,
  }
}
