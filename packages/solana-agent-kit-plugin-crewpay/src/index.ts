/**
 * Solana Agent Kit v2 plugin scaffold for CrewPay.
 * Docs: https://docs.sendai.fun/docs/v2/setup/quickstart
 */

import { z } from 'zod'
import {
  CrewPayClient,
  loadCrewPayEnv,
  SOL_SPEND_CONFIRM_PHRASE,
} from './client.js'

const launchBodySchema = z
  .object({
    name: z.string().min(2).max(32),
    ticker: z.string().min(2).max(13),
    description: z.string().max(204).optional(),
    mode: z.enum(['split', 'buyback', 'raid', 'agent']).optional(),
    initialBuySol: z.number().min(0).max(10).optional(),
    imageUrl: z.string().url().optional(),
    autoHire: z.object({ seats: z.number().int().min(1).max(10).optional() }).optional(),
    humanConfirmed: z.boolean().optional(),
    confirmPhrase: z.string().optional(),
    dryRunToken: z.string().optional(),
  })
  .passthrough()

function api() {
  return new CrewPayClient(loadCrewPayEnv())
}

function stripGateFields(body: Record<string, unknown>) {
  const { humanConfirmed: _h, confirmPhrase: _c, dryRunToken: _d, ...rest } = body
  return rest
}

export const CrewPayPlugin = {
  name: 'crewpay',
  methods: {
    crewDiscover: async () => api().discover(),
    crewAutohire: async (_agent: unknown, body: Record<string, unknown>) => api().autohire(body),
    crewDryRun: async (_agent: unknown, body: Record<string, unknown>) => api().dryRun(body),
    crewLaunch: async (_agent: unknown, body: Record<string, unknown>) => {
      const parsed = launchBodySchema.parse(body)
      return api().launch(stripGateFields(parsed), {
        humanConfirmed: parsed.humanConfirmed === true,
        confirmPhrase: parsed.confirmPhrase || '',
        dryRunToken: parsed.dryRunToken || '',
      })
    },
    crewWireFees: async (
      _agent: unknown,
      body: { mint: string; mode?: string; humanConfirmed?: boolean; confirmPhrase?: string },
    ) =>
      api().wireFees(
        { mint: body.mint, mode: body.mode },
        {
          humanConfirmed: body.humanConfirmed === true,
          confirmPhrase: body.confirmPhrase || '',
        },
      ),
    crewCrank: async (_agent: unknown, body: { mint: string }) => api().crank(body),
    crewProof: async () => api().proof(),
  },
  actions: [
    {
      name: 'CREW_DISCOVER',
      similes: ['crewpay discover', 'crew api info'],
      description: 'Discover CrewPay agent API / fee map / MCP surfaces',
      schema: z.object({}),
      handler: async () => ({ status: 'success', data: await api().discover() }),
    },
    {
      name: 'CREW_AUTOHIRE',
      similes: ['autohire kols', 'hire crew'],
      description: 'Preview Autohire KOL crew (no SOL)',
      schema: z.object({
        name: z.string(),
        ticker: z.string(),
        description: z.string().optional(),
        seats: z.number().int().min(1).max(10).optional(),
      }),
      handler: async (_agent: unknown, input: Record<string, unknown>) => ({
        status: 'success',
        data: await api().autohire(input),
      }),
    },
    {
      name: 'CREW_LAUNCH_DRY_RUN',
      similes: ['crew dry run', 'dry-run launch'],
      description: 'Dry-run launch — returns dryRunToken required for CREW_LAUNCH',
      schema: launchBodySchema.omit({ humanConfirmed: true, confirmPhrase: true, dryRunToken: true }),
      handler: async (_agent: unknown, input: Record<string, unknown>) => ({
        status: 'success',
        data: await api().dryRun(input),
      }),
    },
    {
      name: 'CREW_LAUNCH',
      similes: ['crew launch', 'launch pump coin'],
      description: `Mainnet launch. Requires dryRunToken + humanConfirmed + confirmPhrase ${SOL_SPEND_CONFIRM_PHRASE}. Fee map 60/15/25; buyback not live.`,
      schema: launchBodySchema,
      handler: async (_agent: unknown, input: Record<string, unknown>) => {
        const parsed = launchBodySchema.parse(input)
        return {
          status: 'success',
          data: await api().launch(stripGateFields(parsed), {
            humanConfirmed: parsed.humanConfirmed === true,
            confirmPhrase: parsed.confirmPhrase || '',
            dryRunToken: parsed.dryRunToken || '',
          }),
        }
      },
    },
    {
      name: 'CREW_WIRE_FEES',
      similes: ['wire fees', 'lock fee shares'],
      description: `Wire fee-shares (SOL). Requires humanConfirmed + confirmPhrase ${SOL_SPEND_CONFIRM_PHRASE}.`,
      schema: z.object({
        mint: z.string(),
        mode: z.string().optional(),
        humanConfirmed: z.boolean(),
        confirmPhrase: z.string(),
      }),
      handler: async (
        _agent: unknown,
        input: { mint: string; mode?: string; humanConfirmed: boolean; confirmPhrase: string },
      ) => ({
        status: 'success',
        data: await api().wireFees(
          { mint: input.mint, mode: input.mode },
          { humanConfirmed: input.humanConfirmed, confirmPhrase: input.confirmPhrase },
        ),
      }),
    },
    {
      name: 'CREW_CRANK',
      similes: ['crank remits', 'distribute creator fees'],
      description: 'Crank distributeCreatorFeesV2 via POST /api/agent/crank',
      schema: z.object({ mint: z.string() }),
      handler: async (_agent: unknown, input: { mint: string }) => ({
        status: 'success',
        data: await api().crank(input),
      }),
    },
    {
      name: 'CREW_PROOF',
      similes: ['crew proof tape'],
      description: 'Public proof tape GET /api/proof',
      schema: z.object({}),
      handler: async () => ({ status: 'success', data: await api().proof() }),
    },
  ],
  initialize() {},
}

export default CrewPayPlugin
