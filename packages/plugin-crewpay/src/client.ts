import { loadCrewPayConfig, type CrewPayPluginConfig } from './config.js'
import { redactSecrets } from './redact.js'

export class CrewPayApiClient {
  constructor(private readonly cfg: CrewPayPluginConfig = loadCrewPayConfig()) {}

  get config(): CrewPayPluginConfig {
    return this.cfg
  }

  private headers(): Headers {
    const h = new Headers({ accept: 'application/json', 'content-type': 'application/json' })
    if (this.cfg.apiKey) h.set('x-crew-api-key', this.cfg.apiKey)
    return h
  }

  async fetch(path: string, init?: RequestInit & { auth?: boolean }): Promise<unknown> {
    if (init?.auth && !this.cfg.apiKey) {
      throw new Error(
        `Missing API key — set ${['CREWPAY_API_KEY', 'CREW_AGENT_API_KEY'].join(' or ')} (claim via POST /api/agent/keys/claim)`,
      )
    }
    const res = await fetch(`${this.cfg.apiUrl}${path}`, { ...init, headers: this.headers() })
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
      throw new Error(redactSecrets(`CREW API ${res.status}: ${err}`))
    }
    return json
  }

  discover() {
    return this.fetch('/api/agent')
  }

  platforms() {
    return this.fetch('/api/platforms')
  }

  autohire(body: Record<string, unknown>) {
    return this.fetch('/api/agent/autohire', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    })
  }

  mintStatus(mint: string) {
    return this.fetch(`/api/agent/status/${encodeURIComponent(mint)}`, { auth: true })
  }

  /** Non-custodial: unsigned launch steps only — never signs. */
  buildUnsignedLaunch(body: Record<string, unknown>) {
    return this.fetch('/api/agent/launch/unsigned', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    })
  }

  launchDryRun(body: Record<string, unknown>) {
    return this.fetch('/api/agent/launch/dry-run', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    })
  }

  createCampaign(body: Record<string, unknown>) {
    return this.fetch('/api/jobs/campaigns', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    })
  }

  fundJob(jobId: string, body: Record<string, unknown> = {}) {
    return this.fetch(`/api/jobs/${encodeURIComponent(jobId)}/fund`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    })
  }

  postCoinJob(body: Record<string, unknown>, dryRun = false) {
    const path = dryRun ? '/api/jobs/coin/dry-run' : '/api/jobs/coin'
    return this.fetch(path, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    })
  }

  listOpenJobs(mint?: string) {
    const q = mint ? `?mint=${encodeURIComponent(mint)}` : ''
    return this.fetch(`/api/jobs/open${q}`)
  }

  jobPayout(jobId: string, body: Record<string, unknown>) {
    return this.fetch(`/api/jobs/${encodeURIComponent(jobId)}/payout`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    })
  }
}
