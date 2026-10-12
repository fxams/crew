import { VersionedTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import type { CrewMember } from './narrative.js'
import type { Shareholder } from './shareholders.js'
import type { UnsignedLaunchPlan, UnsignedStep } from './unsigned.js'
import {
  BAGS_COIN_URL,
  BAGS_MAX_CLAIMERS,
  BAGS_MAX_CLAIMERS_NON_LUT,
  BAGS_PUBLIC_LUT,
  assertBagsEnabled,
  bagsApiBase,
} from './platforms.js'

export type BagsHttp = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: BodyInit | null },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>

let bagsHttp: BagsHttp = globalThis.fetch as BagsHttp

export function setBagsHttpForTests(fn: BagsHttp | null): void {
  bagsHttp = fn || (globalThis.fetch as BagsHttp)
}

async function bagsRequest<T>(path: string, init: RequestInit & { apiKey: string }): Promise<T> {
  const url = `${bagsApiBase()}${path.startsWith('/') ? path : `/${path}`}`
  const headers: Record<string, string> = {
    'x-api-key': init.apiKey,
    ...(init.headers as Record<string, string> | undefined),
  }
  const res = await bagsHttp(url, {
    method: init.method || 'GET',
    headers,
    body: init.body ?? null,
  })
  const text = await res.text()
  let json: { success?: boolean; error?: string; response?: T } | T
  try {
    json = JSON.parse(text) as typeof json
  } catch {
    throw new Error(`Bags API ${path} returned non-JSON (${res.status}): ${text.slice(0, 180)}`)
  }
  if (!res.ok || (json && typeof json === 'object' && 'success' in json && json.success === false)) {
    const err =
      json && typeof json === 'object' && 'error' in json && json.error
        ? String(json.error)
        : `Bags API ${path} failed (${res.status})`
    throw new Error(err)
  }
  if (json && typeof json === 'object' && 'response' in json) {
    return (json as { response: T }).response
  }
  return json as T
}

export function bagsTxToStep(
  kind: UnsignedStep['kind'],
  txBase58: string,
  launcher: string,
  extra?: Partial<UnsignedStep>,
): UnsignedStep {
  const raw = Buffer.from(bs58.decode(txBase58))
  let recentBlockhash = extra?.recentBlockhash || ''
  let lastValidBlockHeight = extra?.lastValidBlockHeight || 0
  try {
    const vtx = VersionedTransaction.deserialize(raw)
    recentBlockhash = vtx.message.recentBlockhash
  } catch {
    /* keep provided blockhash */
  }
  return {
    kind,
    messageBase64: raw.toString('base64'),
    transactionBase64: raw.toString('base64'),
    recentBlockhash,
    lastValidBlockHeight,
    requiredSigners: [launcher],
    v: 0,
    encoding: 'solana-tx',
    ...extra,
  }
}

function flattenBagsTransactions(
  payload: {
    transactions?: Array<{ transaction?: string; blockhash?: { blockhash?: string; lastValidBlockHeight?: number } }>
    bundles?: Array<Array<{ transaction?: string; blockhash?: { blockhash?: string; lastValidBlockHeight?: number } }>>
  },
  launcher: string,
  kind: UnsignedStep['kind'],
): UnsignedStep[] {
  const rows = [
    ...(payload.transactions || []),
    ...(payload.bundles || []).flat(),
  ].filter((row) => row?.transaction)
  return rows.map((row, i) =>
    bagsTxToStep(kind, String(row.transaction), launcher, {
      recentBlockhash: row.blockhash?.blockhash,
      lastValidBlockHeight: row.blockhash?.lastValidBlockHeight,
      note: rows.length > 1 ? `Bags ${kind} step ${i + 1}/${rows.length}` : undefined,
    }),
  )
}

export function assertBagsClaimerLimit(claimers: string[]): void {
  if (claimers.length < 1) throw new Error('Bags fee-share needs at least one claimer.')
  if (claimers.length > BAGS_MAX_CLAIMERS) {
    throw new Error(
      `Bags allows at most ${BAGS_MAX_CLAIMERS} fee claimers (got ${claimers.length}: hired KOL crew + launching agent + treasury` +
        `${claimers.length > BAGS_MAX_CLAIMERS ? '' : ''}). Reduce crew seats.`,
    )
  }
}

export async function createBagsTokenInfo(opts: {
  apiKey: string
  name: string
  symbol: string
  description: string
  imageUrl?: string
  image?: { buf: Buffer; filename: string; contentType: string }
  twitter?: string
  website?: string
}): Promise<{ tokenMint: string; tokenMetadata: string }> {
  const form = new FormData()
  form.append('name', opts.name)
  form.append('symbol', opts.symbol.slice(0, 10))
  form.append('description', opts.description.slice(0, 1000))
  if (opts.imageUrl) form.append('imageUrl', opts.imageUrl)
  if (opts.image) {
    const view = new Uint8Array(opts.image.buf)
    form.append('image', new Blob([view], { type: opts.image.contentType }), opts.image.filename)
  }
  if (opts.twitter) form.append('twitter', opts.twitter)
  if (opts.website) form.append('website', opts.website)
  const info = await bagsRequest<{ tokenMint: string; tokenMetadata: string }>(
    '/token-launch/create-token-info',
    { method: 'POST', apiKey: opts.apiKey, body: form },
  )
  if (!info?.tokenMint || !info?.tokenMetadata) {
    throw new Error('Bags create-token-info missing tokenMint/tokenMetadata.')
  }
  return info
}

export async function createBagsFeeShareConfig(opts: {
  apiKey: string
  payer: string
  baseMint: string
  claimers: string[]
  basisPoints: number[]
}): Promise<{
  needsCreation: boolean
  meteoraConfigKey: string
  feeShareAuthority?: string
  steps: UnsignedStep[]
  usedLookupTable: boolean
}> {
  assertBagsClaimerLimit(opts.claimers)
  if (opts.claimers.length !== opts.basisPoints.length) {
    throw new Error('Bags claimersArray and basisPointsArray must align.')
  }
  const total = opts.basisPoints.reduce((s, n) => s + n, 0)
  if (total !== 10_000) throw new Error(`Bags basisPointsArray must total 10000 (got ${total}).`)

  const usedLookupTable = opts.claimers.length > BAGS_MAX_CLAIMERS_NON_LUT
  const body: Record<string, unknown> = {
    payer: opts.payer,
    baseMint: opts.baseMint,
    claimersArray: opts.claimers,
    basisPointsArray: opts.basisPoints,
  }
  if (usedLookupTable) {
    body.additionalLookupTables = [BAGS_PUBLIC_LUT]
  }
  const cfg = await bagsRequest<{
    needsCreation: boolean
    meteoraConfigKey: string
    feeShareAuthority?: string
    transactions?: Array<{ transaction?: string; blockhash?: { blockhash?: string; lastValidBlockHeight?: number } }>
    bundles?: Array<Array<{ transaction?: string; blockhash?: { blockhash?: string; lastValidBlockHeight?: number } }>>
  }>('/fee-share/config', {
    method: 'POST',
    apiKey: opts.apiKey,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!cfg?.meteoraConfigKey) throw new Error('Bags fee-share config missing meteoraConfigKey.')
  const steps = cfg.needsCreation
    ? flattenBagsTransactions(cfg, opts.payer, 'fee_share_config')
    : []
  return {
    needsCreation: Boolean(cfg.needsCreation),
    meteoraConfigKey: cfg.meteoraConfigKey,
    feeShareAuthority: cfg.feeShareAuthority,
    steps,
    usedLookupTable,
  }
}

export async function createBagsLaunchTransaction(opts: {
  apiKey: string
  ipfs: string
  tokenMint: string
  wallet: string
  initialBuyLamports: number
  configKey: string
}): Promise<UnsignedStep> {
  const raw = await bagsRequest<string | { transaction?: string }>('/token-launch/create-launch-transaction', {
    method: 'POST',
    apiKey: opts.apiKey,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ipfs: opts.ipfs,
      tokenMint: opts.tokenMint,
      wallet: opts.wallet,
      initialBuyLamports: Math.max(0, Math.floor(opts.initialBuyLamports)),
      configKey: opts.configKey,
    }),
  })
  const tx = typeof raw === 'string' ? raw : raw?.transaction
  if (!tx) throw new Error('Bags create-launch-transaction missing serialized transaction.')
  return bagsTxToStep(opts.initialBuyLamports > 0 ? 'create_and_buy' : 'create', tx, opts.wallet)
}

export async function buildBagsUnsignedLaunch(opts: {
  name: string
  ticker: string
  description: string
  launcherPubkey: string
  shareholders: Shareholder[]
  crew: CrewMember[]
  initialBuySol?: number
  imageUrl?: string
  image?: { buf: Buffer; filename: string; contentType: string }
  twitter?: string
  website?: string
}): Promise<UnsignedLaunchPlan> {
  const apiKey = assertBagsEnabled()
  const ticker = opts.ticker.replace(/^\$/, '').toUpperCase()
  if (ticker.length > 10) {
    throw new Error('Bags.fm ticker/symbol max 10 characters.')
  }
  if (!opts.imageUrl && !opts.image) {
    throw new Error('Bags.fm launch needs imageUrl or image bytes.')
  }
  const claimers = opts.shareholders.map((s) => s.wallet)
  const basisPoints = opts.shareholders.map((s) => s.bps)
  assertBagsClaimerLimit(claimers)

  const info = await createBagsTokenInfo({
    apiKey,
    name: opts.name,
    symbol: ticker,
    description: opts.description,
    imageUrl: opts.imageUrl,
    image: opts.imageUrl ? undefined : opts.image,
    twitter: opts.twitter,
    website: opts.website,
  })

  const fee = await createBagsFeeShareConfig({
    apiKey,
    payer: opts.launcherPubkey,
    baseMint: info.tokenMint,
    claimers,
    basisPoints,
  })

  const createStep = await createBagsLaunchTransaction({
    apiKey,
    ipfs: info.tokenMetadata,
    tokenMint: info.tokenMint,
    wallet: opts.launcherPubkey,
    initialBuyLamports: Math.round((opts.initialBuySol || 0) * 1e9),
    configKey: fee.meteoraConfigKey,
  })

  const warnings: string[] = []
  if (fee.usedLookupTable) {
    warnings.push(
      `Bags claimer count ${claimers.length} exceeds the ${BAGS_MAX_CLAIMERS_NON_LUT} non-LUT limit — included Bags public LUT ${BAGS_PUBLIC_LUT}. If config creation fails, reduce seats (hired KOL crew + launching agent + treasury + optional referrer).`,
    )
  }
  warnings.push(
    'Bags registers the fee-share config payer as a separate deployer (25% of the gross claimers pool). CrewPay still allocates the 10,000-bps claimers pool as 60% to the KOL crew, 15% to the launching agent, 25% to the treasury (5% referrer when bound).',
  )

  return {
    ok: true,
    platform: 'bags',
    mint: info.tokenMint,
    pumpUrl: BAGS_COIN_URL(info.tokenMint),
    coinUrl: BAGS_COIN_URL(info.tokenMint),
    steps: [...fee.steps, createStep],
    launcher: opts.launcherPubkey,
    createdAt: Date.now(),
    encoding: 'solana-tx',
    warnings,
    note: 'UNSIGNED Bags.fm launch — sign each solana-tx (fee-share config first, then create). Submit via POST /api/agent/launch/submit.',
  }
}
