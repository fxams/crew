/**
 * Minimal CrewPay REST client for framework plugins.
 * Keys from env only — never accept private keys as function arguments.
 */

export const DEFAULT_API_URL = 'https://api.crewpay.dev'

export type CrewPayEnv = {
  apiUrl?: string
  apiKey?: string
  launcherKey?: string
}

export function loadCrewPayEnv(overrides: CrewPayEnv = {}): Required<Pick<CrewPayEnv, 'apiUrl'>> & CrewPayEnv {
  return {
    apiUrl: (overrides.apiUrl || process.env.CREW_API_URL || DEFAULT_API_URL).replace(/\/$/, ''),
    apiKey:
      overrides.apiKey ||
      process.env.CREWPAY_API_KEY?.trim() ||
      process.env.CREW_AGENT_API_KEY?.trim() ||
      '',
    launcherKey:
      overrides.launcherKey ||
      process.env.CREW_LAUNCHER_KEY?.trim() ||
      '',
  }
}

export class CrewPayClient {
  constructor(private readonly env: ReturnType<typeof loadCrewPayEnv> = loadCrewPayEnv()) {}

  private headers(opts?: { launcher?: boolean }): Headers {
    const h = new Headers({ accept: 'application/json', 'content-type': 'application/json' })
    if (this.env.apiKey) h.set('x-crew-api-key', this.env.apiKey)
    if (opts?.launcher) {
      if (!this.env.launcherKey) {
        throw new Error(
          'Missing CREW_LAUNCHER_KEY in env — use a dedicated low-SOL burner. Never pass secrets as arguments.',
        )
      }
      h.set('x-launcher-key', this.env.launcherKey)
    }
    return h
  }

  async fetch(path: string, init?: RequestInit & { auth?: boolean; launcher?: boolean }): Promise<unknown> {
    const headers = this.headers({ launcher: init?.launcher })
    if (init?.auth && !this.env.apiKey) {
      throw new Error('Missing CREWPAY_API_KEY / CREW_AGENT_API_KEY — claim via POST /api/agent/keys/claim')
    }
    const res = await fetch(`${this.env.apiUrl}${path}`, { ...init, headers })
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

  discover() {
    return this.fetch('/api/agent')
  }

  claimKey(body: { label?: string; agentName?: string; model?: string } = {}) {
    return this.fetch('/api/agent/keys/claim', {
      method: 'POST',
      body: JSON.stringify({ label: 'agent', ...body }),
    })
  }

  autohire(body: Record<string, unknown>) {
    return this.fetch('/api/agent/autohire', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    })
  }

  dryRun(body: Record<string, unknown>) {
    return this.fetch('/api/agent/launch/dry-run', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    })
  }

  /**
   * Real launch — spends SOL. Callers MUST dry-run and get human confirmation first.
   */
  launch(body: Record<string, unknown>, opts: { humanConfirmed: boolean }) {
    if (!opts.humanConfirmed) {
      throw new Error('Launch blocked: set humanConfirmed=true only after dry-run + explicit human approval')
    }
    return this.fetch('/api/agent/launch', {
      method: 'POST',
      auth: true,
      launcher: true,
      body: JSON.stringify(body),
    })
  }

  wireFees(body: { mint: string; mode?: string; crew?: unknown[] }) {
    return this.fetch('/api/agent/wire-fees', {
      method: 'POST',
      auth: true,
      launcher: true,
      body: JSON.stringify(body),
    })
  }

  crank(body: { mint: string }) {
    return this.fetch('/api/agent/crank', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    })
  }

  proof() {
    return this.fetch('/api/proof')
  }
}
