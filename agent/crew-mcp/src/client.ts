export const DEFAULT_API_URL = 'https://crewpay-api.onrender.com'
export const DEFAULT_SITE_URL = 'https://crewpay.dev'

export type CrewApiConfig = {
  apiUrl: string
  apiKey?: string
  launcherKey?: string
}

export function loadConfig(): CrewApiConfig {
  return {
    apiUrl: (process.env.CREW_API_URL || DEFAULT_API_URL).replace(/\/$/, ''),
    apiKey: process.env.CREW_AGENT_API_KEY?.trim() || process.env.CREW_API_KEY?.trim() || '',
    launcherKey: process.env.CREW_LAUNCHER_KEY?.trim() || process.env.CREW_AGENT_LAUNCHER_KEY?.trim() || '',
  }
}

export async function crewFetch(
  cfg: CrewApiConfig,
  path: string,
  init?: RequestInit & {
    auth?: boolean
    launcher?: boolean
    launcherKeyOverride?: string
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
        'Missing CREW_AGENT_API_KEY — set it in the MCP server env (Render / Cursor MCP config).',
      )
    }
    headers.set('x-crew-api-key', cfg.apiKey)
  }
  if (init?.launcher) {
    const launcher = (init.launcherKeyOverride || cfg.launcherKey || '').trim()
    if (!launcher) {
      throw new Error(
        'Missing launcher key — pass launcherKey to crew_launch or set CREW_LAUNCHER_KEY in MCP env.',
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
