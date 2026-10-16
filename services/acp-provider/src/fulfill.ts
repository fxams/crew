import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OFFERING_AUTOHIRE, OFFERING_LAUNCH } from './config.js'
import { seatsFromBudget, type AutohireRequirement, type LaunchRequirement } from './offerings.js'

export type FulfillContext = {
  payerWallet?: string
  offering: string
}

export type Fulfillment = {
  autohire(req: AutohireRequirement, ctx: FulfillContext): Promise<unknown>
  launch(req: LaunchRequirement, ctx: FulfillContext): Promise<unknown>
}

function normalizeAutoHire(req: LaunchRequirement): { seats?: number } | undefined {
  if (req.crew?.length) return undefined
  if (req.autoHire === false) return undefined
  if (req.autoHire === true) return { seats: req.seats ?? 5 }
  if (typeof req.autoHire === 'number') return { seats: req.autoHire }
  if (req.autoHire && typeof req.autoHire === 'object') return { seats: req.autoHire.seats ?? req.seats ?? 5 }
  return { seats: req.seats ?? 5 }
}

/** Map ACP requirement → internal Autohire / unsigned-build (x402 path). */
export function toAutohireInput(req: AutohireRequirement, ctx: FulfillContext) {
  return {
    mint: req.mint,
    platform: req.platform,
    name: req.name,
    ticker: req.ticker,
    description: req.description,
    seats: req.seats ?? seatsFromBudget(req.budget),
    optInOnly: req.optInOnly,
    payerWallet: ctx.payerWallet,
  }
}

export function toUnsignedInput(req: LaunchRequirement, ctx: FulfillContext) {
  return {
    name: req.name,
    ticker: req.ticker,
    description: req.description,
    platform: req.platform,
    launcherPubkey:
      req.launcherPubkey ||
      (req.platform === 'zora' || req.platform === 'clanker' ? ctx.payerWallet || '' : ''),
    imageUrl: req.imageUrl,
    imageBase64: req.imageBase64,
    imageContentType: req.imageContentType,
    crew: req.crew,
    autoHire: normalizeAutoHire(req),
    optInOnly: req.optInOnly,
    initialBuySol: req.initialBuySol,
    twitter: req.twitter,
    website: req.website,
    mintPubkey: req.mintPubkey,
    treasuryBps: req.treasuryBps,
    payerWallet: ctx.payerWallet,
  }
}

export async function fulfillJob(
  fulfillment: Fulfillment,
  offering: string,
  requirement: AutohireRequirement | LaunchRequirement,
  ctx: FulfillContext,
): Promise<unknown> {
  if (offering === OFFERING_AUTOHIRE) {
    return fulfillment.autohire(requirement as AutohireRequirement, ctx)
  }
  if (offering === OFFERING_LAUNCH) {
    return fulfillment.launch(requirement as LaunchRequirement, ctx)
  }
  throw new Error(`Unknown offering "${offering}"`)
}

/**
 * Load crew-api Autohire + unsigned-build functions (same path x402 uses).
 * Paying agent wallet is passed through as identity.
 */
export async function loadDirectFulfillment(): Promise<Fulfillment> {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const commercePath = resolve(here, '../../../agent/crew-api/src/lib/agent/commerce.ts')
  const mod = (await import(pathToFileURL(commercePath).href)) as {
    runAutohire: (input: ReturnType<typeof toAutohireInput>) => Promise<unknown>
    runUnsignedLaunch: (input: ReturnType<typeof toUnsignedInput>) => Promise<unknown>
  }
  if (typeof mod.runAutohire !== 'function' || typeof mod.runUnsignedLaunch !== 'function') {
    throw new Error('crew-api commerce module missing runAutohire / runUnsignedLaunch')
  }
  return {
    async autohire(req, ctx) {
      return mod.runAutohire(toAutohireInput(req, ctx))
    },
    async launch(req, ctx) {
      return mod.runUnsignedLaunch(toUnsignedInput(req, ctx))
    },
  }
}
