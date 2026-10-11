/**
 * ElizaOS plugin scaffold for CrewPay.
 * Prefer MCP: npx -y crewpay-mcp@1.2.3 or https://mcp.crewpay.dev/mcp
 *
 * Launch requires dryRunId from CREW_LAUNCH_DRY_RUN after human approval
 * on the approvalUrl page (no confirm phrase).
 */

import { CrewPayClient, loadCrewPayEnv } from './client.js'

function client() {
  return new CrewPayClient(loadCrewPayEnv())
}

function parseJsonContent(message: { content?: { text?: string } }): Record<string, unknown> {
  const text = message.content?.text?.trim() || '{}'
  try {
    const parsed = JSON.parse(text) as unknown
    return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function ok(data: unknown) {
  return { success: true, data }
}

function fail(e: unknown) {
  return { success: false, error: e instanceof Error ? e.message : String(e) }
}

export const crewDiscoverAction = {
  name: 'CREW_DISCOVER',
  similes: ['CREWPAY_DISCOVER'],
  description: 'Discover CrewPay agent API, fee map, and MCP surfaces.',
  validate: async () => true,
  handler: async () => {
    try {
      return ok(await client().discover())
    } catch (e) {
      return fail(e)
    }
  },
}

export const crewAutohireAction = {
  name: 'CREW_AUTOHIRE',
  similes: ['CREWPAY_AUTOHIRE'],
  description: 'Preview Autohire KOL crew (no SOL).',
  validate: async () => Boolean(loadCrewPayEnv().apiKey),
  handler: async (_runtime: unknown, message: { content?: { text?: string } }) => {
    try {
      return ok(await client().autohire(parseJsonContent(message)))
    } catch (e) {
      return fail(e)
    }
  },
}

export const crewDryRunAction = {
  name: 'CREW_LAUNCH_DRY_RUN',
  similes: ['CREWPAY_DRY_RUN', 'CREW_DRY_RUN'],
  description:
    'Dry-run a CrewPay launch (no mint, no SOL). Returns dryRunId + approvalUrl. Human must open approvalUrl before CREW_LAUNCH.',
  validate: async () => Boolean(loadCrewPayEnv().apiKey),
  handler: async (_runtime: unknown, message: { content?: { text?: string } }) => {
    try {
      return ok(await client().dryRun(parseJsonContent(message)))
    } catch (e) {
      return fail(e)
    }
  },
}

export const crewLaunchAction = {
  name: 'CREW_LAUNCH',
  similes: ['CREWPAY_LAUNCH'],
  description:
    'MAINNET launch after dry-run. Requires dryRunId from CREW_LAUNCH_DRY_RUN after human approval on approvalUrl. Fee map 60/15/25; buyback not live.',
  validate: async () => Boolean(loadCrewPayEnv().apiKey && loadCrewPayEnv().launcherKey),
  handler: async (_runtime: unknown, message: { content?: { text?: string } }) => {
    try {
      const body = parseJsonContent(message)
      const dryRunId = typeof body.dryRunId === 'string' ? body.dryRunId : ''
      delete body.dryRunId
      delete body.humanConfirmed
      delete body.confirmPhrase
      delete body.dryRunToken
      return ok(await client().launch(body, { dryRunId }))
    } catch (e) {
      return fail(e)
    }
  },
}

export const crewWireFeesAction = {
  name: 'CREW_WIRE_FEES',
  similes: ['CREWPAY_WIRE_FEES'],
  description:
    'Wire / repair fee-shares (spends SOL). Requires dryRunId from dry-run intent=wire-fees after wallet approval.',
  validate: async () => Boolean(loadCrewPayEnv().apiKey && loadCrewPayEnv().launcherKey),
  handler: async (_runtime: unknown, message: { content?: { text?: string } }) => {
    try {
      const body = parseJsonContent(message)
      const mint = String(body.mint || '')
      const mode = typeof body.mode === 'string' ? body.mode : undefined
      const dryRunId = typeof body.dryRunId === 'string' ? body.dryRunId : ''
      return ok(await client().wireFees({ mint, mode }, { dryRunId }))
    } catch (e) {
      return fail(e)
    }
  },
}

export const crewCrankAction = {
  name: 'CREW_CRANK',
  similes: ['CREWPAY_CRANK', 'CREW_CRANK_REMITS'],
  description: 'POST /api/agent/crank with { mint } to distribute creator fees.',
  validate: async () => Boolean(loadCrewPayEnv().apiKey),
  handler: async (_runtime: unknown, message: { content?: { text?: string } }) => {
    try {
      const body = parseJsonContent(message) as { mint: string }
      return ok(await client().crank(body))
    } catch (e) {
      return fail(e)
    }
  },
}

export const crewProofAction = {
  name: 'CREW_PROOF',
  similes: ['CREWPAY_PROOF'],
  description: 'Read the public CrewPay proof tape (launches / remits / buybacks if any).',
  validate: async () => true,
  handler: async () => {
    try {
      return ok(await client().proof())
    } catch (e) {
      return fail(e)
    }
  },
}

export const crewpayPlugin = {
  name: 'crewpay',
  description:
    'CrewPay — Solana Pump.fun launches with KOL Autohire and on-chain fee-shares (60/15/25). Buyback not live yet. Dry-run → approvalUrl → launch with dryRunId.',
  actions: [
    crewDiscoverAction,
    crewAutohireAction,
    crewDryRunAction,
    crewLaunchAction,
    crewWireFeesAction,
    crewCrankAction,
    crewProofAction,
  ],
  providers: [],
  services: [],
}

export default crewpayPlugin
