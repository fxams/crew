import {
  canX402Pay,
  createXPaymentHeader,
  parsePaymentRequiredHeader,
  type X402Accept,
  type X402Challenge,
} from './x402-pay.js'

export const DEFAULT_API_URL = 'https://api.crewpay.dev'
export const DEFAULT_SITE_URL = 'https://crewpay.dev'

export type CrewApiConfig = {
  apiUrl: string
  apiKey?: string
  launcherKey?: string
  /**
   * Public hosted MCP: do not use a shared env CREW_AGENT_API_KEY for writes.
   * Clients must supply x-crew-api-key on the HTTP MCP request (session override).
   */
  publicMode?: boolean
  /** Hex EVM key for Base USDC x402. Ignored in publicMode. Never a tool arg. */
  x402EvmPrivateKey?: string
  /** Test hook — return a ready PAYMENT-SIGNATURE header from 402 accepts[]. */
  x402Pay?: (accepts: X402Accept[], challenge?: X402Challenge) => Promise<string>
}

export function resolvePublicMode(explicit?: boolean): boolean {
  if (typeof explicit === 'boolean') return explicit
  const flag = (process.env.CREW_MCP_PUBLIC || '').trim().toLowerCase()
  if (flag === '0' || flag === 'false') return false
  if (flag === '1' || flag === 'true') return true
  if (process.env.CREW_MCP_REQUIRE_CLIENT_KEY === '1') return true
  // Stdio stays private (uses env keys). HTTP callers pass explicit publicMode.
  return false
}

export function loadConfig(overrides?: Partial<CrewApiConfig>): CrewApiConfig {
  const publicMode = resolvePublicMode(overrides?.publicMode)

  const envKey =
    process.env.CREW_AGENT_API_KEY?.trim() || process.env.CREW_API_KEY?.trim() || ''
  const envLauncher =
    process.env.CREW_LAUNCHER_KEY?.trim() || process.env.CREW_AGENT_LAUNCHER_KEY?.trim() || ''
  const envX402 =
    process.env.X402_EVM_PRIVATE_KEY?.trim() || process.env.X402_PRIVATE_KEY?.trim() || ''

  return {
    apiUrl: (overrides?.apiUrl || process.env.CREW_API_URL || DEFAULT_API_URL).replace(/\/$/, ''),
    // In public mode, ignore shared env API key unless the HTTP session provided one.
    apiKey: overrides?.apiKey ?? (publicMode ? '' : envKey),
    // Never use a shared launcher secret on public hosted MCP.
    launcherKey: overrides?.launcherKey ?? (publicMode ? '' : envLauncher),
    x402EvmPrivateKey: overrides?.x402EvmPrivateKey ?? (publicMode ? '' : envX402),
    x402Pay: overrides?.x402Pay,
    publicMode,
  }
}

export function cfgCanX402Pay(cfg: CrewApiConfig): boolean {
  return Boolean(cfg.x402Pay) || canX402Pay(cfg.x402EvmPrivateKey)
}

function challengeFrom402(json: unknown, headers: Headers): X402Challenge {
  const fromHeader = parsePaymentRequiredHeader(headers.get('PAYMENT-REQUIRED'))
  const fromBody = json && typeof json === 'object' ? (json as X402Challenge) : {}
  const accepts =
    (Array.isArray(fromBody.accepts) && fromBody.accepts.length ? fromBody.accepts : null) ||
    fromHeader?.accepts ||
    []
  return {
    ...fromHeader,
    ...fromBody,
    accepts,
  }
}

async function pay402(cfg: CrewApiConfig, json: unknown, headers: Headers): Promise<string> {
  const challenge = challengeFrom402(json, headers)
  const accepts = challenge.accepts || []
  if (cfg.x402Pay) return cfg.x402Pay(accepts, challenge)
  if (!cfg.x402EvmPrivateKey) {
    throw new Error('x402 payment configured incorrectly — missing X402_EVM_PRIVATE_KEY')
  }
  return createXPaymentHeader({ accepts, evmPrivateKey: cfg.x402EvmPrivateKey, challenge })
}

export async function crewFetch(
  cfg: CrewApiConfig,
  path: string,
  init?: RequestInit & {
    auth?: boolean
    launcher?: boolean
    idempotencyKey?: string
  },
): Promise<unknown> {
  const headers = new Headers(init?.headers)
  if (!headers.has('accept')) headers.set('accept', 'application/json')
  if (init?.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  if (init?.auth) {
    if (cfg.apiKey) {
      headers.set('x-crew-api-key', cfg.apiKey)
    } else if (!cfgCanX402Pay(cfg)) {
      throw new Error(
        cfg.publicMode
          ? 'Missing API key — pass header x-crew-api-key on the MCP HTTP request (or run crewpay-mcp locally with CREW_AGENT_API_KEY or X402_EVM_PRIVATE_KEY). Mint via POST /api/agent/keys/claim.'
          : 'Missing CREW_AGENT_API_KEY — set it in the MCP server env, or set X402_EVM_PRIVATE_KEY to pay per call. Mint via POST /api/agent/keys/claim.',
      )
    }
  }
  if (init?.launcher) {
    const launcher = (cfg.launcherKey || '').trim()
    if (!launcher) {
      throw new Error(
        cfg.publicMode
          ? 'Hosted public MCP cannot launch with your wallet. Run crewpay-mcp locally with CREW_LAUNCHER_KEY in env, or call REST https://api.crewpay.dev with x-launcher-key from your secure backend. Never pass secrets as tool arguments.'
          : 'Missing CREW_LAUNCHER_KEY — set the agent Solana secret in MCP env only (never as a tool argument).',
      )
    }
    headers.set('x-launcher-key', launcher)
  }
  if (init?.idempotencyKey) {
    headers.set('x-idempotency-key', init.idempotencyKey)
  }

  const url = `${cfg.apiUrl}${path}`
  let res = await fetch(url, { ...init, headers })
  let { json, text } = await readJson(res)

  if (
    res.status === 402 &&
    init?.auth &&
    !cfg.apiKey &&
    cfgCanX402Pay(cfg) &&
    !headers.has('X-PAYMENT') &&
    !headers.has('PAYMENT-SIGNATURE')
  ) {
    const payment = await pay402(cfg, json, res.headers)
    headers.set('PAYMENT-SIGNATURE', payment)
    headers.set('X-PAYMENT', payment)
    res = await fetch(url, { ...init, headers })
    ;({ json, text } = await readJson(res))
  }

  if (!res.ok) {
    const err =
      typeof json === 'object' && json && 'error' in json
        ? String((json as { error: unknown }).error)
        : text.slice(0, 300)
    const retryHeader = res.headers.get('retry-after')
    const retryBody =
      typeof json === 'object' && json && 'retryAfterSec' in json
        ? Number((json as { retryAfterSec: unknown }).retryAfterSec)
        : NaN
    const retryAfterSec = Number.isFinite(retryBody)
      ? retryBody
      : retryHeader
        ? Number(retryHeader)
        : undefined
    const retrySuffix =
      res.status === 429 && retryAfterSec && Number.isFinite(retryAfterSec)
        ? ` (retryAfterSec=${retryAfterSec})`
        : ''
    throw new Error(`CREW API ${res.status}: ${err}${retrySuffix}`)
  }
  return json
}

async function readJson(res: Response): Promise<{ json: unknown; text: string }> {
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 500) }
  }
  return { json, text }
}

export function asText(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}
