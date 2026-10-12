import { getAgentKeyReferral } from '../agent-referral.js'
import { getCoin } from '../coins.js'
import { listRegisteredHireBoosts } from '../registered-hires.js'
import { planNarrativeHires } from './narrative.js'
import { parseLaunchPlatform, type LaunchPlatform } from './platforms.js'
import { maxCrewSeats } from './shareholders.js'

export const AUTOHIRE_DISCLAIMER =
  'Autohire matches public Pump.fun profiles by narrative. Wallets are not opt-in partners, endorsed affiliates, or employees of CREW. Operators choose who receives fee-shares.'

/** Requested seats may exceed the fee-map cap; handlers clamp + warn. */
export const AUTOHIRE_SEATS_REQUEST_MAX = 20

export type AutohireInput = {
  name?: string
  ticker?: string
  description?: string
  seats?: number
  optInOnly?: boolean
  /** Token mint or contract address — used to look up name/ticker when omitted. */
  mint?: string
  platform?: string
  /**
   * Paying agent wallet (ACP / x402 identity). Recorded on the result; fee map
   * stays 60% hired KOL crew / 15% launching agent / rest treasury.
   */
  payerWallet?: string
  keyId?: string
}

export type AutohireHire = {
  rank: number
  handle: string
  pump: string
  x: string | null
  wallet: string
  followers: number
  dbRank: number
  share: number
  role: string
  reasons: string[]
  score: number
  registered: boolean
}

export type AutohireResult = {
  ok: true
  seats: number
  seatsRequested: number
  seatsMax: number
  seatsDropped: number
  warnings: string[]
  match: ReturnType<typeof planNarrativeHires>['match']
  policy: NonNullable<ReturnType<typeof planNarrativeHires>['policy']> | 'score'
  registeredPreferred: number
  optedInOnly: boolean
  hires: AutohireHire[]
  crew: ReturnType<typeof planNarrativeHires>['crew']
  disclaimer: string
  tip: string
  mint?: string
  platform?: LaunchPlatform
  /** Paying agent wallet = identity (ACP / x402). */
  identity?: string
  feeMap: '60% hired KOL crew / 15% launching agent / rest treasury'
}

async function narrativeFromMint(mint: string): Promise<{
  name: string
  ticker: string
  description: string
}> {
  try {
    const coin = await getCoin(mint)
    if (coin) {
      return { name: coin.name, ticker: coin.ticker, description: coin.vibe || '' }
    }
  } catch {
    /* board lookup is optional — mint still works as narrative text */
  }
  return { name: '', ticker: '', description: mint }
}

/**
 * Internal Autohire used by HTTP, ACP, and the same path an x402 payer hits.
 * Paying agent wallet is identity only — it does not change the fee split.
 */
export async function runAutohire(input: AutohireInput): Promise<AutohireResult> {
  let name = (input.name || '').trim()
  let ticker = (input.ticker || '').trim()
  let description = (input.description || '').trim()
  const mint = (input.mint || '').trim() || undefined
  if (mint && !name && !ticker && !description) {
    const looked = await narrativeFromMint(mint)
    name = looked.name
    ticker = looked.ticker
    description = looked.description
  }
  if (!name && !ticker && !description) {
    throw new Error('Provide name, ticker, description, or mint for narrative matching.')
  }

  let platform: LaunchPlatform | undefined
  if (input.platform) {
    platform = parseLaunchPlatform(input.platform)
  }

  const boundRef = input.keyId ? await getAgentKeyReferral(input.keyId) : null
  const maxSeats = maxCrewSeats({ hasAgentReferrer: Boolean(boundRef), platform })
  const requested = Math.max(1, Math.floor(input.seats ?? 5))
  const seats = Math.min(maxSeats, requested)
  const seatsDropped = requested > seats ? requested - seats : 0
  const registered = await listRegisteredHireBoosts()
  const plan = planNarrativeHires(
    { name, ticker, vibe: description },
    { limit: seats, registered, onlyRegistered: Boolean(input.optInOnly) },
  )
  const warnings: string[] = []
  if (seatsDropped > 0) {
    warnings.push(
      `Requested ${requested} seats; capped to ${seats} for this key (` +
        `${boundRef ? 'referred max 7' : `max ${maxSeats}`}). Dropped ${seatsDropped}.`,
    )
  }
  const identity = (input.payerWallet || '').trim() || undefined
  return {
    ok: true,
    seats,
    seatsRequested: requested,
    seatsMax: maxSeats,
    seatsDropped,
    warnings,
    match: plan.match,
    policy: plan.policy || 'score',
    registeredPreferred: registered.length,
    optedInOnly: Boolean(input.optInOnly),
    hires: plan.hires.map((h) => ({
      rank: h.hireRank,
      handle: `@${h.kol.x || h.kol.pump}`,
      pump: h.kol.pump,
      x: h.kol.x,
      wallet: h.kol.wallet,
      followers: h.kol.followers,
      dbRank: h.kol.rank,
      share: h.share,
      role: h.role,
      reasons: h.reasons,
      score: h.score,
      registered: h.reasons.some((r) => /registered crew/i.test(r)),
    })),
    crew: plan.crew,
    disclaimer: AUTOHIRE_DISCLAIMER,
    tip:
      (plan.policy === 'registered-first'
        ? 'Registered-first: registered KOLs fill seats first (then narrative picks). '
        : 'Score policy: narrative picks by score. ') +
      'Inspect hires/reasons, remix via crew[], or keep autoHire. Listing ≠ consent.',
    mint,
    platform,
    identity,
    feeMap: '60% hired KOL crew / 15% launching agent / rest treasury',
  }
}
