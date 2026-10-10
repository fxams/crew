/**
 * GOAT SDK plugin scaffold for CrewPay.
 * Prefer MCP: npx -y crewpay-mcp@1.2.1 or https://mcp.crewpay.dev/mcp
 */

import {
  CrewPayClient,
  loadCrewPayEnv,
  SOL_SPEND_CONFIRM_PHRASE,
} from './client.js'

export type CrewPayGoatOptions = {
  apiUrl?: string
  apiKey?: string
}

function api(opts: CrewPayGoatOptions = {}) {
  return new CrewPayClient(loadCrewPayEnv(opts))
}

export class CrewPayGoatService {
  constructor(private readonly opts: CrewPayGoatOptions = {}) {}

  async crewpay_discover() {
    return api(this.opts).discover()
  }

  async crewpay_autohire(params: Record<string, unknown>) {
    return api(this.opts).autohire(params)
  }

  async crewpay_launch_dry_run(params: Record<string, unknown>) {
    return api(this.opts).dryRun(params)
  }

  /**
   * Spends SOL. Requires dryRunToken from dry-run + confirmPhrase APPROVE_SOL_SPEND + humanConfirmed.
   */
  async crewpay_launch(
    params: Record<string, unknown> & {
      humanConfirmed?: boolean
      confirmPhrase?: string
      dryRunToken?: string
    },
  ) {
    const { humanConfirmed, confirmPhrase, dryRunToken, ...rest } = params
    return api(this.opts).launch(rest, {
      humanConfirmed: humanConfirmed === true,
      confirmPhrase: confirmPhrase || '',
      dryRunToken: dryRunToken || '',
    })
  }

  async crewpay_wire_fees(params: {
    mint: string
    mode?: string
    humanConfirmed?: boolean
    confirmPhrase?: string
  }) {
    const { humanConfirmed, confirmPhrase, mint, mode } = params
    return api(this.opts).wireFees(
      { mint, mode },
      {
        humanConfirmed: humanConfirmed === true,
        confirmPhrase: confirmPhrase || '',
      },
    )
  }

  async crewpay_crank(params: { mint: string }) {
    return api(this.opts).crank(params)
  }

  async crewpay_proof() {
    return api(this.opts).proof()
  }
}

export function crewpay(options: CrewPayGoatOptions = {}) {
  return {
    name: 'crewpay',
    description: `CrewPay — Pump.fun KOL Autohire + fee-shares (60/15/25). Buyback not live. Dry-run token + ${SOL_SPEND_CONFIRM_PHRASE} before launch.`,
    service: new CrewPayGoatService(options),
  }
}

export default crewpay
