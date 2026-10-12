import { z } from 'zod'
import { OFFERING_AUTOHIRE, OFFERING_LAUNCH } from './config.js'

const LAUNCH_PLATFORMS = ['pumpfun', 'bags', 'zora'] as const

export const autohireRequirementSchema = z.object({
  mint: z.string().min(20).max(80),
  platform: z.enum(LAUNCH_PLATFORMS),
  budget: z.union([
    z.number().positive(),
    z.string().min(1).max(32),
    z.object({
      seats: z.number().int().min(1).max(20).optional(),
      usd: z.number().nonnegative().optional(),
    }),
  ]),
  name: z.string().max(32).optional(),
  ticker: z.string().max(13).optional(),
  description: z.string().max(204).optional(),
  seats: z.number().int().min(1).max(20).optional(),
  optInOnly: z.boolean().optional(),
})

const crewMemberSchema = z.object({
  handle: z.string().min(1).max(32),
  wallet: z.string().min(20).max(64),
  share: z.number().int().min(1).max(100),
  hireRole: z.enum(['caller', 'chart', 'raid', 'kol', 'dev']).optional(),
  evmWallet: z.string().min(20).max(64).optional(),
})

export const launchRequirementSchema = z
  .object({
    name: z.string().min(2).max(32),
    ticker: z.string().min(2).max(13),
    description: z.string().max(204).optional(),
    platform: z.enum(LAUNCH_PLATFORMS).optional().default('pumpfun'),
    launcherPubkey: z.string().min(20).max(64).optional(),
    imageUrl: z.string().url().optional(),
    imageBase64: z.string().min(64).optional(),
    imageContentType: z.string().max(64).optional(),
    crew: z.array(crewMemberSchema).min(1).max(100).optional(),
    autoHire: z
      .union([
        z.boolean(),
        z.number().int().min(1).max(20),
        z.object({ seats: z.number().int().min(1).max(20).optional() }),
      ])
      .optional(),
    seats: z.number().int().min(1).max(20).optional(),
    optInOnly: z.boolean().optional(),
    initialBuySol: z.number().min(0).max(10).optional(),
    twitter: z.string().max(128).optional(),
    website: z.string().max(256).optional(),
    mintPubkey: z.string().min(20).max(64).optional(),
    treasuryBps: z.number().int().min(2000).max(3000).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.imageUrl && !val.imageBase64) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide imageUrl or imageBase64 (unsigned launch is non-custodial).',
        path: ['imageUrl'],
      })
    }
    if (val.platform !== 'zora' && !val.launcherPubkey) {
      ctx.addIssue({
        code: 'custom',
        message: 'launcherPubkey is required for Pump.fun / Bags.fm (the address that will sign).',
        path: ['launcherPubkey'],
      })
    }
  })

export type AutohireRequirement = z.infer<typeof autohireRequirementSchema>
export type LaunchRequirement = z.infer<typeof launchRequirementSchema>
export type OfferingId = typeof OFFERING_AUTOHIRE | typeof OFFERING_LAUNCH

export type OfferingJson = {
  name: string
  description: string
  slaMinutes: number
  priceUsd: number
  requirements: Record<string, unknown>
}

export function offeringRegistry(prices: {
  autohireUsd: number
  launchUsd: number
}): OfferingJson[] {
  return [
    {
      name: OFFERING_AUTOHIRE,
      description:
        'Hire a KOL crew for an existing token via CrewPay Autohire. Deliverable is crew list JSON. Fee map 60% hired KOL crew / 15% launching agent / rest treasury.',
      slaMinutes: 15,
      priceUsd: prices.autohireUsd,
      requirements: {
        type: 'object',
        required: ['mint', 'platform', 'budget'],
        additionalProperties: false,
        properties: {
          mint: {
            type: 'string',
            minLength: 20,
            maxLength: 80,
            description: 'Token mint (Solana) or contract address (EVM).',
          },
          platform: { type: 'string', enum: [...LAUNCH_PLATFORMS] },
          budget: {
            description: 'Campaign budget hint (number, string, or { seats, usd }). ACP job price is separate.',
            oneOf: [
              { type: 'number', exclusiveMinimum: 0 },
              { type: 'string' },
              {
                type: 'object',
                properties: {
                  seats: { type: 'integer', minimum: 1, maximum: 20 },
                  usd: { type: 'number', minimum: 0 },
                },
              },
            ],
          },
          name: { type: 'string', maxLength: 32 },
          ticker: { type: 'string', maxLength: 13 },
          description: { type: 'string', maxLength: 204 },
          seats: { type: 'integer', minimum: 1, maximum: 20 },
          optInOnly: { type: 'boolean' },
        },
      },
    },
    {
      name: OFFERING_LAUNCH,
      description:
        'Build unsigned launch transactions (crew_build_unsigned) plus crew_submit_signed instructions. CrewPay never holds the launcher key. Fee map 60% hired KOL crew / 15% launching agent / rest treasury.',
      slaMinutes: 30,
      priceUsd: prices.launchUsd,
      requirements: {
        type: 'object',
        required: ['name', 'ticker'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 32 },
          ticker: { type: 'string', minLength: 2, maxLength: 13 },
          description: { type: 'string', maxLength: 204 },
          platform: { type: 'string', enum: [...LAUNCH_PLATFORMS], default: 'pumpfun' },
          launcherPubkey: {
            type: 'string',
            description: 'Address that will sign. Required for pumpfun/bags. Zora may use the paying ACP wallet.',
          },
          imageUrl: { type: 'string', format: 'uri' },
          imageBase64: { type: 'string' },
          crew: { type: 'array', items: { type: 'object' } },
          autoHire: { description: 'true | seats number | { seats }' },
          seats: { type: 'integer', minimum: 1, maximum: 20 },
          optInOnly: { type: 'boolean' },
          initialBuySol: { type: 'number', minimum: 0, maximum: 10 },
          twitter: { type: 'string' },
          website: { type: 'string' },
          mintPubkey: { type: 'string' },
          treasuryBps: { type: 'integer', minimum: 2000, maximum: 3000 },
        },
      },
    },
  ]
}

export function parseOfferingId(raw: unknown): OfferingId | null {
  const v = String(raw || '').trim()
  if (v === OFFERING_AUTOHIRE || v === OFFERING_LAUNCH) return v
  return null
}

export type ParsedRequirement =
  | { ok: true; offering: OfferingId; value: AutohireRequirement | LaunchRequirement }
  | { ok: false; error: string }

export function validateRequirement(offering: OfferingId, raw: unknown): ParsedRequirement {
  try {
    if (offering === OFFERING_AUTOHIRE) {
      return { ok: true, offering, value: autohireRequirementSchema.parse(raw) }
    }
    return { ok: true, offering, value: launchRequirementSchema.parse(raw) }
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') : 'invalid requirement'
    return { ok: false, error: `Invalid ${offering} requirement — ${msg}` }
  }
}

export function seatsFromBudget(budget: AutohireRequirement['budget']): number | undefined {
  if (typeof budget === 'object' && budget && 'seats' in budget) return budget.seats
  if (typeof budget === 'number' && Number.isInteger(budget) && budget >= 1 && budget <= 20) return budget
  return undefined
}
