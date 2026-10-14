import type { CrewPayApiClient } from './client.js'

/**
 * Escrow surface for agent tasks/bounties.
 * Today: jobs + /fund. Swap implementation when unified escrow-for-any-task lands.
 */
export interface TaskEscrowBackend {
  postBounty(body: Record<string, unknown>, opts?: { fund?: boolean; rail?: string; from?: string }): Promise<unknown>
  postTask(body: Record<string, unknown>, opts?: { dryRun?: boolean; fund?: boolean }): Promise<unknown>
  payAgent(jobId: string, body: Record<string, unknown>): Promise<unknown>
}

export class JobsEscrowBackend implements TaskEscrowBackend {
  constructor(private readonly api: CrewPayApiClient) {}

  async postBounty(
    body: Record<string, unknown>,
    opts?: { fund?: boolean; rail?: string; from?: string },
  ): Promise<unknown> {
    const created = (await this.api.createCampaign(body)) as { job?: { id?: string } }
    const jobId = created?.job?.id
    if (!opts?.fund || !jobId) {
      return { phase: 'jobs+campaigns', created, note: 'Fund via POST /api/jobs/:id/fund or HIRE_CREW fund step' }
    }
    const funding = await this.api.fundJob(jobId, {
      rail: opts.rail,
      from: opts.from,
    })
    return { phase: 'jobs+campaigns', created, funding }
  }

  async postTask(
    body: Record<string, unknown>,
    opts?: { dryRun?: boolean; fund?: boolean },
  ): Promise<unknown> {
    const payload = { ...body }
    if (opts?.fund) payload.fund = true
    const result = await this.api.postCoinJob(payload, Boolean(opts?.dryRun))
    return { phase: 'jobs+coin', dryRun: Boolean(opts?.dryRun), result }
  }

  async payAgent(jobId: string, body: Record<string, unknown>): Promise<unknown> {
    const payout = await this.api.jobPayout(jobId, body)
    return {
      phase: 'jobs+payout',
      payout,
      note: 'Non-custodial rails return unsigned — sign locally; this plugin never auto-signs.',
    }
  }
}

/** Env toggle for a future unified escrow API (not merged yet). */
export function resolveTaskEscrowBackend(api: CrewPayApiClient): TaskEscrowBackend {
  const mode = (process.env.CREWPAY_ESCROW_MODE || 'jobs').trim().toLowerCase()
  if (mode !== 'jobs') {
    throw new Error(
      `CREWPAY_ESCROW_MODE=${mode} is not available yet — use jobs (default) until escrow-for-any-task ships`,
    )
  }
  return new JobsEscrowBackend(api)
}
