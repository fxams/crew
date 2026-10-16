import { z } from 'zod'
import { AUTOHIRE_SEATS_REQUEST_MAX } from './autohire-run.js'
import { MAX_CREW, MAX_INITIAL_BUY_SOL, USER_DESCRIPTION_MAX } from './constants.js'
import { errorMessage, normalizeAutoHireInput } from './errors.js'
import { assertSafeHttpUrl } from './safe-url.js'
import { isEvmAddress } from './evm-address.js'
import { isEvmLaunchPlatform, isSuiLaunchPlatform, parseLaunchPlatform } from './platforms.js'
import { isSuiAddress } from './sui-address.js'
import { solanaAddress } from './solana-address.js'

export const crewMemberSchemaFlexible = z.object({
  handle: z.string().min(1).max(32),
  wallet: z.string().min(20).max(64),
  share: z.number().int().min(1).max(100),
  hireRole: z.enum(['caller', 'chart', 'raid', 'kol', 'dev']).optional(),
})

export function refineLaunchBody(
  val: {
    imageUrl?: string
    imageBase64?: string
    website?: string
    holderKol?: boolean
    crew?: { share: number; wallet: string }[]
    autoHire?: unknown
    platform?: string
    launcherPubkey?: string
  },
  ctx: z.RefinementCtx,
) {
  if (!val.imageUrl && !val.imageBase64) {
    ctx.addIssue({
      code: 'custom',
      message: 'Provide imageUrl or imageBase64',
      path: ['imageUrl'],
    })
  }
  if (!val.holderKol && !val.crew?.length && !val.autoHire) {
    ctx.addIssue({
      code: 'custom',
      message: 'Provide crew[] or autoHire (or holderKol: true)',
      path: ['autoHire'],
    })
  }
  if (val.crew?.length) {
    const shareSum = val.crew.reduce((s, m) => s + Math.round(Number(m.share) || 0), 0)
    if (shareSum !== 100) {
      ctx.addIssue({
        code: 'custom',
        message: `Crew shares must total 100% (now ${shareSum}%). Shares are relative to the hired-KOL pool, not including the 25% platform buyback.`,
        path: ['crew'],
      })
    }
  }
  if (val.imageUrl) {
    try {
      assertSafeHttpUrl(val.imageUrl, 'imageUrl')
    } catch (err) {
      ctx.addIssue({
        code: 'custom',
        message: errorMessage(err, 'Invalid imageUrl'),
        path: ['imageUrl'],
      })
    }
  }
  if (val.website) {
    try {
      assertSafeHttpUrl(val.website, 'website')
    } catch (err) {
      ctx.addIssue({
        code: 'custom',
        message: errorMessage(err, 'Invalid website'),
        path: ['website'],
      })
    }
  }

  const platform = parseLaunchPlatform(val.platform)
  const evm = isEvmLaunchPlatform(platform)
  const sui = isSuiLaunchPlatform(platform)
  if (val.launcherPubkey?.trim()) {
    const lp = val.launcherPubkey.trim()
    if (sui) {
      if (!isSuiAddress(lp)) {
        ctx.addIssue({
          code: 'custom',
          message: 'launcherPubkey must be a Sui address (0x…) when platform is sui.',
          path: ['launcherPubkey'],
        })
      }
    } else if (evm) {
      if (!isEvmAddress(lp)) {
        ctx.addIssue({
          code: 'custom',
          message: 'launcherPubkey must be a 0x EVM address when platform is zora, clanker, or vibevibe.',
          path: ['launcherPubkey'],
        })
      }
    } else {
      const parsed = solanaAddress.safeParse(lp)
      if (!parsed.success) {
        ctx.addIssue({
          code: 'custom',
          message: 'launcherPubkey must be a Solana base58 address for pumpfun/bags.',
          path: ['launcherPubkey'],
        })
      }
    }
  }
  if (val.crew?.length) {
    val.crew.forEach((m, i) => {
      const w = m.wallet.trim()
      if (sui) {
        if (!isSuiAddress(w)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Crew wallet must be a Sui address (0x…) when platform is sui.',
            path: ['crew', i, 'wallet'],
          })
        }
      } else if (evm) {
        if (!isEvmAddress(w)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Crew wallet must be a 0x EVM address when platform is zora, clanker, or vibevibe.',
            path: ['crew', i, 'wallet'],
          })
        }
      } else {
        const parsed = solanaAddress.safeParse(w)
        if (!parsed.success) {
          ctx.addIssue({
            code: 'custom',
            message: 'Crew wallet must be a Solana base58 address for pumpfun/bags.',
            path: ['crew', i, 'wallet'],
          })
        }
      }
    })
  }
}

/** Shared launch / dry-run body — platform-aware wallet validation. */
export const launchBodySchema = z
  .object({
    name: z.string().min(2).max(32),
    ticker: z
      .string()
      .min(2)
      .max(13)
      .regex(/^\$?[A-Za-z0-9]{2,13}$/, 'Ticker must be 2–13 letters/numbers'),
    description: z.string().max(USER_DESCRIPTION_MAX).optional().default(''),
    mode: z.enum(['split', 'buyback', 'raid', 'agent']).optional().default('agent'),
    twitter: z.string().max(128).optional(),
    website: z.string().max(256).optional(),
    initialBuySol: z.number().min(0).max(MAX_INITIAL_BUY_SOL).optional().default(0),
    imageUrl: z.string().url().optional(),
    imageBase64: z.string().min(64).optional(),
    imageContentType: z.string().max(64).optional(),
    crew: z.array(crewMemberSchemaFlexible).min(1).max(MAX_CREW).optional(),
    autoHire: z.preprocess(
      normalizeAutoHireInput,
      z
        .object({
          seats: z.number().int().min(1).max(AUTOHIRE_SEATS_REQUEST_MAX).optional().default(5),
        })
        .optional(),
    ),
    agent: z
      .object({
        name: z.string().min(2).max(48),
        objective: z.string().min(8).max(280),
        model: z.string().max(48).optional(),
      })
      .optional(),
    holderKol: z.boolean().optional().default(false),
    atomicRequired: z.boolean().optional().default(false),
    launcherPubkey: z.string().min(20).max(64).optional(),
    dryRunId: z.string().min(16).max(64).optional(),
    platform: z.enum(['pumpfun', 'bags', 'zora', 'clanker', 'vibevibe', 'sui']).optional().default('pumpfun'),
    treasuryCapObjectId: z.string().min(42).max(90).optional(),
    publishedPackageId: z.string().min(42).max(90).optional(),
  })
  .superRefine(refineLaunchBody)

/** Parse mint path/query for agent status — Solana base58 or EVM 0x. */
export function parseAgentStatusMint(raw: string, platformHint?: string | null): string {
  const trimmed = raw.trim()
  if (isEvmAddress(trimmed)) {
    return trimmed.toLowerCase()
  }
  if (platformHint) {
    const p = parseLaunchPlatform(platformHint)
    if (isEvmLaunchPlatform(p) && isEvmAddress(trimmed)) {
      return trimmed.toLowerCase()
    }
  }
  return solanaAddress.parse(trimmed)
}
