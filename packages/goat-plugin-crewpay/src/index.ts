/**
 * GOAT SDK plugin scaffold for CrewPay.
 * Prefer MCP: npx -y crewpay-mcp@1.2.2 or https://mcp.crewpay.dev/mcp
 */

import { CrewPayClient, loadCrewPayEnv } from './client.js'

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
   * Spends SOL. Requires dryRunId from dry-run after human approval on approvalUrl.
   */
  async crewpay_launch(
    params: Record<string, unknown> & {
      dryRunId?: string
    },
  ) {
    const { dryRunId, humanConfirmed: _h, confirmPhrase: _c, dryRunToken: _t, ...rest } = params
    return api(this.opts).launch(rest, {
      dryRunId: dryRunId || '',
    })
  }

  async crewpay_wire_fees(params: { mint: string; mode?: string }) {
    return api(this.opts).wireFees({ mint: params.mint, mode: params.mode })
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
    description:
      'CrewPay — Pump.fun KOL Autohire + fee-shares (60/15/25). Buyback not live. Dry-run → approvalUrl → launch with dryRunId.',
    tools: new CrewPayGoatService(options),
  }
}

export default crewpay
