/**
 * GOAT SDK plugin scaffold for CrewPay.
 * Pattern inspired by @goat-sdk plugins (PluginBase + tool methods).
 *
 * Prefer MCP for production agents: npx -y crewpay-mcp@1.2.0
 * or https://mcp.crewpay.dev/mcp (no launcher secret on hosted).
 */

import { CrewPayClient, loadCrewPayEnv } from '../../crewpay-rest/src/client.ts'

export type CrewPayGoatOptions = {
  apiUrl?: string
  /** If omitted, read CREWPAY_API_KEY / CREW_AGENT_API_KEY from env */
  apiKey?: string
}

function api(opts: CrewPayGoatOptions = {}) {
  return new CrewPayClient(loadCrewPayEnv(opts))
}

/** Tool surface for GOAT agents — wrap with your ToolBase/decorators as needed. */
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
   * Spends SOL. Requires params.humanConfirmed === true after dry-run + human OK.
   */
  async crewpay_launch(params: Record<string, unknown> & { humanConfirmed?: boolean }) {
    const { humanConfirmed, ...rest } = params
    return api(this.opts).launch(rest, { humanConfirmed: humanConfirmed === true })
  }

  async crewpay_wire_fees(params: { mint: string; mode?: string }) {
    return api(this.opts).wireFees(params)
  }

  async crewpay_crank(params: { mint: string }) {
    return api(this.opts).crank(params)
  }

  async crewpay_proof() {
    return api(this.opts).proof()
  }
}

/**
 * Lightweight plugin factory (does not hard-depend on @goat-sdk/core at compile time).
 * When wiring into GOAT, wrap CrewPayGoatService with PluginBase/ToolBase as in upstream plugins.
 */
export function crewpay(options: CrewPayGoatOptions = {}) {
  return {
    name: 'crewpay',
    description:
      'CrewPay — Solana Pump.fun KOL Autohire + fee-shares (60/15/25). Buyback not live. Dry-run + human confirm before launch.',
    service: new CrewPayGoatService(options),
  }
}

export default crewpay
