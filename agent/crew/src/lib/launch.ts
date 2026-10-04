import type { Coin, CrewMember, LaunchInput, Remit } from './types'

const BPS_TOTAL = 10_000

export class LaunchValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LaunchValidationError'
  }
}

function normalizeHandle(raw: string): string {
  const h = raw.trim().replace(/^@+/, '').toLowerCase()
  if (!/^[a-z0-9_]{1,15}$/.test(h)) {
    throw new LaunchValidationError(`Invalid X handle: @${raw.trim()}`)
  }
  return h
}

export function validateCrewSplit(crew: CrewMember[]): CrewMember[] {
  if (crew.length < 1 || crew.length > 5) {
    throw new LaunchValidationError('Tag between 1 and 5 X handles.')
  }

  const seen = new Set<string>()
  let bpsSum = 0
  const normalized: CrewMember[] = []

  for (const member of crew) {
    const handle = normalizeHandle(member.handle)
    if (seen.has(handle)) {
      throw new LaunchValidationError(`Duplicate crew handle: @${handle}`)
    }
    seen.add(handle)

    const bps = Math.round(Number(member.bps))
    if (!Number.isFinite(bps) || bps <= 0 || bps > BPS_TOTAL) {
      throw new LaunchValidationError(`Bad split for @${handle}.`)
    }
    bpsSum += bps
    normalized.push({ handle, bps })
  }

  if (bpsSum !== BPS_TOTAL) {
    throw new LaunchValidationError(
      `Crew split must total 100% (got ${(bpsSum / 100).toFixed(2)}%).`,
    )
  }

  return normalized
}

function fakeCa(): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let out = ''
  for (let i = 0; i < 44; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

/** Demo mint: validates 100% crew split, returns a fake CA. No wallet / chain. */
export async function demoLaunch(input: LaunchInput): Promise<{ coin: Coin; remits: Remit[] }> {
  const name = input.name.trim()
  const ticker = input.ticker.trim().toUpperCase().replace(/^\$/, '')
  const description = input.description.trim()

  if (name.length < 2 || name.length > 32) {
    throw new LaunchValidationError('Name must be 2–32 characters.')
  }
  if (!/^[A-Z0-9]{2,13}$/.test(ticker)) {
    throw new LaunchValidationError('Ticker must be 2–13 A–Z / 0–9.')
  }
  if (description.length > 280) {
    throw new LaunchValidationError('Description max 280 characters.')
  }

  const crew = validateCrewSplit(input.crew)
  const launchedAt = Date.now()
  const coin: Coin = {
    id: id('coin'),
    ca: fakeCa(),
    name,
    ticker,
    description,
    mode: input.mode,
    crew,
    launchedAt,
    demo: true,
  }

  // Seed a few tape lines so launch success is screenshottable immediately.
  const remits: Remit[] = crew.slice(0, 3).map((member, i) => ({
    id: id('remit'),
    coinId: coin.id,
    ticker: coin.ticker,
    handle: member.handle,
    amountSol: Number(((0.004 + Math.random() * 0.02) * (member.bps / BPS_TOTAL) * 5).toFixed(4)),
    amountUsd: 0,
    mode: coin.mode,
    at: launchedAt + (i + 1) * 1000,
  })).map((r) => ({ ...r, amountUsd: Number((r.amountSol * 148.2).toFixed(2)) }))

  await delay(420)
  return { coin, remits }
}

/**
 * Mainnet path — stubbed.
 * Intended: Pump IPFS metadata → createV2 + fee-share config → wallet sign.
 * See PRODUCT.md. Do not call from UI until SDK + wallet adapter are wired.
 */
export async function mainnetLaunch(_input: LaunchInput): Promise<never> {
  void _input
  throw new Error(
    [
      'mainnetLaunch is stubbed.',
      'Planned path:',
      '1) Upload metadata JSON to Pump IPFS',
      '2) Build createV2 + createFeeSharingConfig / updateFeeSharesV2 (permanent bps)',
      '3) Prompt wallet sign (Phantom / Solana adapter)',
      '4) Confirm mint and register coin on the CREW board',
    ].join(' '),
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
