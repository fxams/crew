/**
 * Minimal CrewPay REST client for framework plugins.
 * Keys from env only — never accept private keys as function arguments.
 *
 * Spend gates: dry-run issues a short-lived dryRunToken; launch/wire require that
 * token (launch) plus the exact confirmPhrase APPROVE_SOL_SPEND (not a free-form
 * boolean the model can invent from chat alone).
 */

import { createHash, randomBytes } from 'node:crypto'

export const DEFAULT_API_URL = 'https://api.crewpay.dev'

/** Exact phrase a human must supply for SOL-spending calls. */
export const SOL_SPEND_CONFIRM_PHRASE = 'APPROVE_SOL_SPEND'

export type CrewPayEnv = {
  apiUrl?: string
  apiKey?: string
  launcherKey?: string
}

type DryRunRecord = {
  bodyHash: string
  expiresAt: number
}

const pendingDryRuns = new Map<string, DryRunRecord>()
const DRY_RUN_TTL_MS = 30 * 60 * 1000

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

/** Canonical hash of launch fields so dry-run and launch bodies must match. */
export function hashLaunchBody(body: Record<string, unknown>): string {
  const pick = {
    name: body.name,
    ticker: body.ticker,
    description: body.description ?? null,
    mode: body.mode ?? 'agent',
    initialBuySol: body.initialBuySol ?? 0,
    imageUrl: body.imageUrl ?? null,
    autoHire: body.autoHire ?? null,
    crew: body.crew ?? null,
    holderKol: body.holderKol ?? false,
  }
  return createHash('sha256').update(JSON.stringify(pick)).digest('hex')
}

function assertSpendConfirm(opts: { humanConfirmed?: boolean; confirmPhrase?: string }, action: string) {
  if (opts.humanConfirmed !== true) {
    throw new Error(`${action} blocked: humanConfirmed must be true after an explicit human approval`)
  }
  if (opts.confirmPhrase !== SOL_SPEND_CONFIRM_PHRASE) {
    throw new Error(
      `${action} blocked: confirmPhrase must be exactly "${SOL_SPEND_CONFIRM_PHRASE}" (human-supplied; do not invent)`,
    )
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

  async dryRun(body: Record<string, unknown>) {
    const data = await this.fetch('/api/agent/launch/dry-run', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    })
    const dryRunToken = randomBytes(16).toString('hex')
    pendingDryRuns.set(dryRunToken, {
      bodyHash: hashLaunchBody(body),
      expiresAt: Date.now() + DRY_RUN_TTL_MS,
    })
    return {
      ...(typeof data === 'object' && data ? data : { result: data }),
      dryRunToken,
      confirmPhraseRequired: SOL_SPEND_CONFIRM_PHRASE,
      tip: `To launch: pass the same body + dryRunToken + humanConfirmed:true + confirmPhrase:"${SOL_SPEND_CONFIRM_PHRASE}" (human must supply the phrase).`,
    }
  }

  /**
   * Real launch — spends SOL. Requires a prior dryRunToken for this body plus
   * humanConfirmed and confirmPhrase APPROVE_SOL_SPEND.
   */
  launch(
    body: Record<string, unknown>,
    opts: { humanConfirmed: boolean; confirmPhrase: string; dryRunToken: string },
  ) {
    assertSpendConfirm(opts, 'Launch')
    const pending = pendingDryRuns.get(opts.dryRunToken)
    if (!pending || pending.expiresAt < Date.now()) {
      throw new Error('Launch blocked: missing/expired dryRunToken — call dryRun first and reuse its dryRunToken')
    }
    if (pending.bodyHash !== hashLaunchBody(body)) {
      throw new Error('Launch blocked: body does not match the dry-run that issued dryRunToken')
    }
    pendingDryRuns.delete(opts.dryRunToken)
    return this.fetch('/api/agent/launch', {
      method: 'POST',
      auth: true,
      launcher: true,
      body: JSON.stringify(body),
    })
  }

  wireFees(
    body: { mint: string; mode?: string; crew?: unknown[] },
    opts: { humanConfirmed: boolean; confirmPhrase: string },
  ) {
    assertSpendConfirm(opts, 'Wire-fees')
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
