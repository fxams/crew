/**
 * ElizaOS plugin scaffold for CrewPay.
 * Docs: https://docs.elizaos.ai/plugins/development
 *
 * Env: CREWPAY_API_KEY (or CREW_AGENT_API_KEY), optional CREW_LAUNCHER_KEY (burner), CREW_API_URL.
 * Launch/wire require dryRunToken (from dry-run) + confirmPhrase APPROVE_SOL_SPEND + humanConfirmed.
 */

import {
  CrewPayClient,
  loadCrewPayEnv,
  SOL_SPEND_CONFIRM_PHRASE,
} from '../../crewpay-rest/src/client.ts'

type ActionResult = { success: boolean; text?: string; data?: unknown; error?: string }

function client() {
  return new CrewPayClient(loadCrewPayEnv())
}

function ok(data: unknown, text?: string): ActionResult {
  return { success: true, text: text ?? JSON.stringify(data, null, 2), data }
}

function fail(err: unknown): ActionResult {
  const message = err instanceof Error ? err.message : String(err)
  return { success: false, error: message, text: message }
}

function parseJsonContent(message: { content?: { text?: string } }): Record<string, unknown> {
  const raw = message.content?.text?.trim() || '{}'
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const crewDiscoverAction = {
  name: 'CREW_DISCOVER',
  similes: ['CREWPAY_DISCOVER', 'CREW_API_INFO'],
  description: 'GET CrewPay agent discovery JSON (endpoints, fee map, MCP).',
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
  similes: ['CREWPAY_AUTOHIRE', 'HIRE_KOLS'],
  description: 'Preview KOL Autohire crew for a name/ticker/description (no SOL).',
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
  description: `Dry-run a CrewPay launch (no mint, no SOL). Returns dryRunToken required for CREW_LAUNCH. Human must later supply confirmPhrase ${SOL_SPEND_CONFIRM_PHRASE}.`,
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
  description: `MAINNET launch after dry-run. Requires dryRunToken from CREW_LAUNCH_DRY_RUN, humanConfirmed:true, and confirmPhrase:${SOL_SPEND_CONFIRM_PHRASE} (human-supplied). Fee map 60/15/25; buyback not live.`,
  validate: async () => Boolean(loadCrewPayEnv().apiKey && loadCrewPayEnv().launcherKey),
  handler: async (_runtime: unknown, message: { content?: { text?: string } }) => {
    try {
      const body = parseJsonContent(message)
      const humanConfirmed = body.humanConfirmed === true
      const confirmPhrase = typeof body.confirmPhrase === 'string' ? body.confirmPhrase : ''
      const dryRunToken = typeof body.dryRunToken === 'string' ? body.dryRunToken : ''
      delete body.humanConfirmed
      delete body.confirmPhrase
      delete body.dryRunToken
      return ok(await client().launch(body, { humanConfirmed, confirmPhrase, dryRunToken }))
    } catch (e) {
      return fail(e)
    }
  },
}

export const crewWireFeesAction = {
  name: 'CREW_WIRE_FEES',
  similes: ['CREWPAY_WIRE_FEES'],
  description: `Wire / repair fee-shares (spends SOL). Requires humanConfirmed:true and confirmPhrase:${SOL_SPEND_CONFIRM_PHRASE}.`,
  validate: async () => Boolean(loadCrewPayEnv().apiKey && loadCrewPayEnv().launcherKey),
  handler: async (_runtime: unknown, message: { content?: { text?: string } }) => {
    try {
      const body = parseJsonContent(message)
      const humanConfirmed = body.humanConfirmed === true
      const confirmPhrase = typeof body.confirmPhrase === 'string' ? body.confirmPhrase : ''
      const mint = String(body.mint || '')
      const mode = typeof body.mode === 'string' ? body.mode : undefined
      return ok(await client().wireFees({ mint, mode }, { humanConfirmed, confirmPhrase }))
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
    'CrewPay — Solana Pump.fun launches with KOL Autohire and on-chain fee-shares (60/15/25). Buyback not live yet. Dry-run token + APPROVE_SOL_SPEND before launch.',
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
