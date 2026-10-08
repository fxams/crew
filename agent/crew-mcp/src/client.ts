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

  return {
    apiUrl: (overrides?.apiUrl || process.env.CREW_API_URL || DEFAULT_API_URL).replace(/\/$/, ''),
    // In public mode, ignore shared env API key unless the HTTP session provided one.
    apiKey: overrides?.apiKey ?? (publicMode ? '' : envKey),
    // Never use a shared launcher secret on public hosted MCP.
    launcherKey: overrides?.launcherKey ?? (publicMode ? '' : envLauncher),
    publicMode,
  }
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
    if (!cfg.apiKey) {
      throw new Error(
        cfg.publicMode
          ? 'Missing API key — pass header x-crew-api-key on the MCP HTTP request (or run crewpay-mcp locally with CREW_AGENT_API_KEY). Mint via POST /api/agent/keys/claim.'
          : 'Missing CREW_AGENT_API_KEY — set it in the MCP server env. Mint via POST /api/agent/keys/claim.',
      )
    }
    headers.set('x-crew-api-key', cfg.apiKey)
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

  const res = await fetch(`${cfg.apiUrl}${path}`, { ...init, headers })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 500) }
  }
  if (!res.ok) {
    const err =
      typeof json === 'object' && json && 'error' in json
        ? String((json as { error: unknown }).error)
        : text.slice(0, 300)
    throw new Error(`CREW API ${res.status}: ${err}`)
  }
  return json
}

export function asText(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}
