/**
 * Traction-gated kickoff kit.
 * Budget = treasury share of THIS coin's accrued fees minus spent/reserved.
 * Items unlock only when that budget covers the configured USD cost in full.
 * Approval reserves the cost (no double-spend). No on-chain treasury transfers.
 */

import { randomBytes } from 'node:crypto'
import { AGENT_REFERRAL_BPS, PLATFORM_BUYBACK_BPS, platformBuybackBps } from './agent/constants.js'
import { coinPageUrl } from './coin-page.js'
import type { FeeAccrual } from './fee-accrual.js'
import {
  feeRatesPublic,
  projectCreatorFees,
  type FeePlatform,
  type FeeProjection,
} from './fee-rates.js'
import { envEthUsd, envSolUsd, peekFx } from './fx.js'

export const KICKOFF_ITEM_IDS = [
  'website',
  'ai-crew',
  'crew-post',
  'custom-domain',
  'dexscreener',
  'dextools',
  'x-account',
] as const
export type KickoffItemId = (typeof KICKOFF_ITEM_IDS)[number]

export type KickoffProposalStatus = 'pending' | 'approved' | 'rejected'
export type KickoffPayoutStatus = 'none' | 'queued'

export type KickoffAuditAction =
  | 'proposed'
  | 'auto-approved'
  | 'admin-approved'
  | 'rejected'

export type KickoffFundedAt = {
  costUsd: number
  fundedUsd: number | null
  progress: number | null
  shortfallUsd: number | null
  fullyFunded: boolean
  label: string
}

export type KickoffCatalogItem = {
  id: KickoffItemId
  label: string
  summary: string
  costUsd: number
  costSol: number | null
  included: boolean
  priceMayChange: boolean
  href?: string
  costNote: string
}

export type KickoffExtra = KickoffCatalogItem & {
  eligible: boolean
  state: string
  fundedAt: KickoffFundedAt
}

export type KickoffProposal = {
  id: string
  mint: string
  itemId: KickoffItemId
  label: string
  costSol: number
  costUsd: number
  solUsd?: number | null
  status: KickoffProposalStatus
  payoutStatus: KickoffPayoutStatus
  createdAt: number
  decidedAt?: number
  decidedBy?: string
  autoApproved?: boolean
  note: string
}

export type KickoffAuditEvent = {
  id: string
  at: number
  mint: string
  proposalId: string
  action: KickoffAuditAction
  actor: string
  costSol: number
  costUsd?: number | null
  autoCapUsd: number
  remainingBudgetUsd: number | null
  remainingBudgetSol: number
  detail: string
}

export type KickoffTraction = {
  feesGeneratedSol: number
  volumeUsd: number
  holders: number
  minFeesSol: number
  minVolumeUsd: number
  minHolders: number
  met: boolean
  reasons: string[]
}

export type DexscreenerGate = {
  met: boolean
  volumeUsd: number
  marketCapSol: number | null
  minVolumeUsd: number
  minMcapSol: number
  reasons: string[]
}

export type KickoffNextItem = {
  id: KickoffItemId
  label: string
  costUsd: number
  fundedAt: KickoffFundedAt
  tractionMet: boolean
}

export type KickoffFreeTier = {
  page: boolean
  aiMemesPerDay: number
  crewPost: boolean
  sharedXHandle: string
  dedicatedXAccount: false
  note: string
}

export type KickoffBudget = {
  feesGeneratedSol: number
  accruedSol: number
  accruedEth: number
  distributedSol: number
  unclaimedSol: number | null
  hasReferrer: boolean
  treasuryBps: number
  capSol: number
  capUsd: number | null
  spentUsd: number
  reservedUsd: number
  pendingUsd: number
  availableUsd: number | null
  spentSol: number
  pendingSol: number
  availableSol: number
  solUsd: number | null
  ethUsd: number | null
  accruedAt: number | null
  ttlMs: number | null
  source: string
  note: string
}

const proposals = new Map<string, KickoffProposal>()
const auditLog: KickoffAuditEvent[] = []

export function resetKickoff() {
  proposals.clear()
  auditLog.length = 0
}

export function listKickoffAudit(mint?: string): KickoffAuditEvent[] {
  const want = (mint || '').trim()
  return auditLog.filter((e) => !want || e.mint === want).slice(-200)
}

function pushAudit(e: Omit<KickoffAuditEvent, 'id'>) {
  auditLog.push({ ...e, id: `ka_${randomBytes(6).toString('hex')}` })
}

/** Per-coin auto-approve cap in USD. Default 0 = disabled (all wait for admin). */
export function kickoffAutoApproveUsd(): number {
  return numEnv('CREW_KICKOFF_AUTO_USD', 0)
}

/** Live SOL/USD: env override, else last cached FX feed. */
export function kickoffSolUsd(): number | null {
  return envSolUsd() ?? peekFx()?.solUsd ?? null
}

export function kickoffEthUsd(): number | null {
  return envEthUsd() ?? peekFx()?.ethUsd ?? null
}

export function costSolFromUsd(costUsd: number, solUsd: number | null): number {
  if (solUsd == null || !(solUsd > 0)) return 0
  return Number((costUsd / solUsd).toFixed(9))
}

/**
 * Auto-approve when CREW_KICKOFF_AUTO_USD > 0, USD cost is known and ≤ cap,
 * and the USD cost fits this coin's remaining treasury fee budget in full.
 */
export function shouldAutoApprove(opts: {
  costUsd: number | null
  availableUsd: number | null
  autoCapUsd?: number
}): boolean {
  const cap = opts.autoCapUsd ?? kickoffAutoApproveUsd()
  if (!(cap > 0)) return false
  if (opts.costUsd == null || !Number.isFinite(opts.costUsd)) return false
  if (opts.availableUsd == null || !Number.isFinite(opts.availableUsd)) return false
  if (opts.costUsd - cap > 1e-9) return false
  if (opts.costUsd - opts.availableUsd > 1e-9) return false
  return true
}

function numEnv(name: string, fallback: number): number {
  const n = Number(process.env[name])
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

function moneyLabel(n: number): string {
  if (!Number.isFinite(n)) return '--'
  const abs = Math.abs(n)
  const digits = abs >= 100 || Number.isInteger(n) ? 0 : abs >= 10 ? 2 : 2
  const s = n.toFixed(digits)
  return s.replace(/\.00$/, '')
}

export function fundedAtProgress(costUsd: number, budgetUsd: number | null): KickoffFundedAt {
  if (!(costUsd > 0)) {
    return {
      costUsd: 0,
      fundedUsd: budgetUsd,
      progress: 1,
      shortfallUsd: 0,
      fullyFunded: true,
      label: 'included',
    }
  }
  if (budgetUsd == null || !Number.isFinite(budgetUsd)) {
    return {
      costUsd,
      fundedUsd: null,
      progress: null,
      shortfallUsd: null,
      fullyFunded: false,
      label: '--',
    }
  }
  const funded = Math.max(0, budgetUsd)
  const progress = Math.min(1, funded / costUsd)
  const shortfallUsd = Math.max(0, costUsd - funded)
  const pct = Math.floor(progress * 100)
  return {
    costUsd,
    fundedUsd: Number(funded.toFixed(6)),
    progress,
    shortfallUsd: Number(shortfallUsd.toFixed(6)),
    fullyFunded: shortfallUsd <= 1e-9,
    label: `$${moneyLabel(funded)} / $${moneyLabel(costUsd)} (${pct}%)`,
  }
}

export function crewXHandle(): string {
  const h = (process.env.CREW_X_HANDLE || 'crewpay').trim().replace(/^@/, '')
  return h || 'crewpay'
}

export function kickoffCatalog(opts?: { mint?: string; solUsd?: number | null }): KickoffCatalogItem[] {
  const solUsd = opts?.solUsd ?? kickoffSolUsd()
  const mint = (opts?.mint || '').trim()
  const page = mint ? coinPageUrl(mint) : 'https://crewpay.dev/coin/<mint>'
  const x = crewXHandle()
  const memes = Math.max(0, Math.floor(numEnv('AI_CREW_MAX_PER_DAY', 3)))
  const items: KickoffCatalogItem[] = [
    {
      id: 'website',
      label: 'Coin page (hosted)',
      summary: `Free hosted page at ${page.replace(/^https:\/\//, '')}.`,
      costUsd: 0,
      costSol: 0,
      included: true,
      priceMayChange: false,
      href: mint ? page : undefined,
      costNote: 'Included with every launch. No treasury spend.',
    },
    {
      id: 'ai-crew',
      label: 'AI memes',
      summary: `${memes || 'A few'} lightweight AI memes/captions per day (AI_CREW_MAX_PER_DAY). Humans remain the core.`,
      costUsd: 0,
      costSol: 0,
      included: true,
      priceMayChange: false,
      costNote: 'Free tier. Configurable daily cap. No dedicated model keys.',
    },
    {
      id: 'crew-post',
      label: 'Crew post',
      summary: `Posted from the shared @${x} account. No per-coin X account by default.`,
      costUsd: 0,
      costSol: 0,
      included: true,
      priceMayChange: false,
      href: `https://x.com/${x}`,
      costNote: 'Small coins share the CrewPay account. Dedicated X is not in the default kit.',
    },
    {
      id: 'custom-domain',
      label: 'Custom domain',
      summary: 'Optional custom domain pointed at the hosted coin page.',
      costUsd: numEnv('KICKOFF_COST_CUSTOM_DOMAIN_USD', 10),
      costSol: null,
      included: false,
      priceMayChange: false,
      costNote: 'Default ~$10. Override KICKOFF_COST_CUSTOM_DOMAIN_USD.',
    },
    {
      id: 'dexscreener',
      label: 'Dexscreener Enhanced Token Info',
      summary: 'Paid Dexscreener Enhanced Token Info for this mint.',
      costUsd: numEnv('KICKOFF_COST_DEXSCREENER_USD', 299),
      costSol: null,
      included: false,
      priceMayChange: true,
      costNote: 'Public Dexscreener list price; may change. Override KICKOFF_COST_DEXSCREENER_USD.',
    },
  ]
  const dextoolsUsd = numEnv('KICKOFF_COST_DEXTOOLS_USD', 0)
  if (dextoolsUsd > 0) {
    items.push({
      id: 'dextools',
      label: 'DEXTools listing',
      summary: 'Paid DEXTools update for this mint.',
      costUsd: dextoolsUsd,
      costSol: null,
      included: false,
      priceMayChange: true,
      costNote: 'Configurable via KICKOFF_COST_DEXTOOLS_USD. Price may change.',
    })
  }
  const xUsd = numEnv('KICKOFF_COST_X_ACCOUNT_USD', 0)
  if (xUsd > 0) {
    items.push({
      id: 'x-account',
      label: 'Dedicated X account',
      summary: 'Stand up a coin X account (manual ops after approval).',
      costUsd: xUsd,
      costSol: null,
      included: false,
      priceMayChange: false,
      costNote: 'Configurable via KICKOFF_COST_X_ACCOUNT_USD.',
    })
  }
  for (const item of items) {
    if (!item.included) item.costSol = costSolFromUsd(item.costUsd, solUsd) || null
  }
  return items
}

export function tractionThresholds() {
  return {
    minFeesSol: numEnv('KICKOFF_MIN_FEES_SOL', 0.05),
    minVolumeUsd: numEnv('KICKOFF_MIN_VOLUME_USD', 0),
    minHolders: numEnv('KICKOFF_MIN_HOLDERS', 0),
  }
}

export function dexscreenerMinVolumeUsd(): number {
  return numEnv('KICKOFF_DEXSCREENER_MIN_VOLUME_USD', 100_000)
}

export function dexscreenerMinMcapSol(): number {
  return numEnv('KICKOFF_DEXSCREENER_MIN_MCAP_SOL', 1000)
}

export function marketCapSolFrom(opts: {
  marketCapSol?: number | null
  marketCapUsd?: number | null
  solUsd?: number | null
}): number | null {
  if (opts.marketCapSol != null && Number.isFinite(opts.marketCapSol) && opts.marketCapSol > 0) {
    return opts.marketCapSol
  }
  if (
    opts.marketCapUsd != null &&
    Number.isFinite(opts.marketCapUsd) &&
    opts.marketCapUsd > 0 &&
    opts.solUsd != null &&
    opts.solUsd > 0
  ) {
    return opts.marketCapUsd / opts.solUsd
  }
  return null
}

/** Dexscreener unlocks at ~$100K volume OR Pump.fun mcap ≥ 1,000 SOL (configurable), plus full funding. */
export function evaluateDexscreenerGate(input: {
  volumeUsd?: number
  marketCapUsd?: number | null
  marketCapSol?: number | null
  solUsd?: number | null
}): DexscreenerGate {
  const minVolumeUsd = dexscreenerMinVolumeUsd()
  const minMcapSol = dexscreenerMinMcapSol()
  const volumeUsd = Math.max(0, Number(input.volumeUsd) || 0)
  const marketCapSol = marketCapSolFrom(input)
  const volOk = minVolumeUsd <= 0 || volumeUsd + 1e-9 >= minVolumeUsd
  const mcapOk = minMcapSol <= 0 || (marketCapSol != null && marketCapSol + 1e-9 >= minMcapSol)
  const met = volOk || mcapOk
  const reasons: string[] = []
  if (!met) {
    const mcapLabel = marketCapSol == null ? '--' : `${marketCapSol.toFixed(0)} SOL`
    reasons.push(
      `need volume ≥ $${minVolumeUsd.toLocaleString('en-US')} or Pump mcap ≥ ${minMcapSol} SOL (now $${volumeUsd.toFixed(0)} / ${mcapLabel})`,
    )
  }
  return { met, volumeUsd, marketCapSol, minVolumeUsd, minMcapSol, reasons }
}

export function evaluateTraction(input: {
  feesGeneratedSol: number
  volumeUsd?: number
  holders?: number
}): KickoffTraction {
  const th = tractionThresholds()
  const volumeUsd = Number(input.volumeUsd || 0)
  const holders = Number(input.holders || 0)
  const reasons: string[] = []
  if (input.feesGeneratedSol + 1e-12 < th.minFeesSol) {
    reasons.push(`fees ${input.feesGeneratedSol} SOL < ${th.minFeesSol} SOL`)
  }
  if (th.minVolumeUsd > 0 && volumeUsd + 1e-12 < th.minVolumeUsd) {
    reasons.push(`volume $${volumeUsd} < $${th.minVolumeUsd}`)
  }
  if (th.minHolders > 0 && holders < th.minHolders) {
    reasons.push(`holders ${holders} < ${th.minHolders}`)
  }
  return {
    feesGeneratedSol: input.feesGeneratedSol,
    volumeUsd,
    holders,
    minFeesSol: th.minFeesSol,
    minVolumeUsd: th.minVolumeUsd,
    minHolders: th.minHolders,
    met: reasons.length === 0,
    reasons,
  }
}

/** Treasury share of this coin's accrued fees, minus spent and reserved (approved) amounts. */
export function computeKickoffBudget(input: {
  feesGeneratedSol?: number
  accruedSol?: number
  accruedEth?: number
  distributedSol?: number
  unclaimedSol?: number | null
  hasReferrer: boolean
  spentUsd?: number
  reservedUsd?: number
  pendingUsd?: number
  solUsd?: number | null
  ethUsd?: number | null
  accruedAt?: number | null
  ttlMs?: number | null
  source?: string
}): KickoffBudget {
  const accruedSol = Math.max(0, Number(input.accruedSol ?? input.feesGeneratedSol) || 0)
  const accruedEth = Math.max(0, Number(input.accruedEth) || 0)
  const treasuryBps = platformBuybackBps(Boolean(input.hasReferrer))
  const solUsd = input.solUsd === undefined ? kickoffSolUsd() : input.solUsd
  const ethUsd = input.ethUsd === undefined ? kickoffEthUsd() : input.ethUsd
  const capSol = (accruedSol * treasuryBps) / 10_000
  let capUsd: number | null = null
  if (solUsd != null && solUsd > 0) {
    capUsd = (accruedSol * solUsd * treasuryBps) / 10_000
  }
  if (ethUsd != null && ethUsd > 0 && accruedEth > 0) {
    capUsd = (capUsd || 0) + (accruedEth * ethUsd * treasuryBps) / 10_000
  }
  const spentUsd = Math.max(0, Number(input.spentUsd) || 0)
  const reservedUsd = Math.max(0, Number(input.reservedUsd) || 0)
  const pendingUsd = Math.max(0, Number(input.pendingUsd) || 0)
  const availableUsd =
    capUsd == null ? null : Math.max(0, Number((capUsd - spentUsd - reservedUsd).toFixed(6)))
  const spentSol = solUsd && solUsd > 0 ? spentUsd / solUsd : 0
  const pendingSol = solUsd && solUsd > 0 ? pendingUsd / solUsd : 0
  const availableSol =
    availableUsd != null && solUsd && solUsd > 0
      ? Math.max(0, availableUsd / solUsd)
      : Math.max(0, capSol - spentSol)
  return {
    feesGeneratedSol: accruedSol,
    accruedSol,
    accruedEth,
    distributedSol: Math.max(0, Number(input.distributedSol) || 0),
    unclaimedSol: input.unclaimedSol ?? null,
    hasReferrer: Boolean(input.hasReferrer),
    treasuryBps,
    capSol,
    capUsd,
    spentUsd,
    reservedUsd,
    pendingUsd,
    availableUsd,
    spentSol,
    pendingSol,
    availableSol,
    solUsd,
    ethUsd,
    accruedAt: input.accruedAt ?? null,
    ttlMs: input.ttlMs ?? null,
    source: input.source || 'unknown',
    note: input.hasReferrer
      ? 'Treasury share is 20% of this coin’s accrued fees (60/15/5/20 with referrer), minus spent and reserved. Items unlock only when fully covered.'
      : 'Treasury share is 25% of this coin’s accrued fees (60/15/25), minus spent and reserved. Items unlock only when fully covered.',
  }
}

export function budgetFromAccrual(opts: {
  mint: string
  accrual: Pick<
    FeeAccrual,
    'accruedSol' | 'accruedEth' | 'distributedSol' | 'unclaimedSol' | 'at' | 'ttlMs' | 'source'
  >
  hasReferrer: boolean
  solUsd?: number | null
  ethUsd?: number | null
}): KickoffBudget {
  return computeKickoffBudget({
    accruedSol: opts.accrual.accruedSol,
    accruedEth: opts.accrual.accruedEth,
    distributedSol: opts.accrual.distributedSol,
    unclaimedSol: opts.accrual.unclaimedSol,
    hasReferrer: opts.hasReferrer,
    spentUsd: spentUsdFor(opts.mint),
    reservedUsd: reservedUsdFor(opts.mint),
    pendingUsd: pendingUsdFor(opts.mint),
    solUsd: opts.solUsd,
    ethUsd: opts.ethUsd,
    accruedAt: opts.accrual.at,
    ttlMs: opts.accrual.ttlMs,
    source: opts.accrual.source,
  })
}

export function listProposals(mint?: string): KickoffProposal[] {
  const want = (mint || '').trim()
  return [...proposals.values()]
    .filter((p) => !want || p.mint === want)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function getKickoffProposal(id: string): KickoffProposal | null {
  return proposals.get(id) || null
}

export function spentUsdFor(mint: string): number {
  return 0
}

export function reservedUsdFor(mint: string): number {
  return listProposals(mint)
    .filter((p) => p.status === 'approved')
    .reduce((n, p) => n + p.costUsd, 0)
}

export function pendingUsdFor(mint: string): number {
  return listProposals(mint)
    .filter((p) => p.status === 'pending')
    .reduce((n, p) => n + p.costUsd, 0)
}

export function spentSolFor(mint: string): number {
  const solUsd = kickoffSolUsd()
  if (solUsd && solUsd > 0) return reservedUsdFor(mint) / solUsd
  return listProposals(mint)
    .filter((p) => p.status === 'approved')
    .reduce((n, p) => n + p.costSol, 0)
}

export function pendingSolFor(mint: string): number {
  const solUsd = kickoffSolUsd()
  if (solUsd && solUsd > 0) return pendingUsdFor(mint) / solUsd
  return listProposals(mint)
    .filter((p) => p.status === 'pending')
    .reduce((n, p) => n + p.costSol, 0)
}

export function proposeKickoff(opts: {
  mint: string
  itemId: KickoffItemId
  budget: KickoffBudget
  traction: KickoffTraction
  dexscreener?: DexscreenerGate
  now?: number
}): KickoffProposal {
  if (!opts.traction.met) {
    throw new Error(`Traction gate not met: ${opts.traction.reasons.join('; ') || 'locked'}`)
  }
  if (opts.itemId === 'dexscreener') {
    const gate = opts.dexscreener
    if (!gate?.met) {
      throw new Error(
        `Dexscreener traction not met: ${gate?.reasons.join('; ') || 'need ~$100K volume or 1,000 SOL mcap'}`,
      )
    }
  }
  const catalog = kickoffCatalog({ mint: opts.mint, solUsd: opts.budget.solUsd })
  const item = catalog.find((c) => c.id === opts.itemId)
  if (!item) throw new Error('Unknown kickoff item')
  if (item.included || !(item.costUsd > 0)) {
    throw new Error('Included items are not proposed — hosted coin page is free')
  }
  const existing = listProposals(opts.mint).find(
    (p) => p.itemId === opts.itemId && (p.status === 'pending' || p.status === 'approved'),
  )
  if (existing) throw new Error(`Kickoff item already ${existing.status}`)
  if (opts.budget.availableUsd == null) {
    throw new Error('USD budget unknown — will not propose until SOL/ETH FX is cached')
  }
  if (item.costUsd - opts.budget.availableUsd > 1e-9) {
    throw new Error(
      `Cost $${item.costUsd} exceeds available treasury budget $${opts.budget.availableUsd} (item must be fully covered)`,
    )
  }
  const solUsd = opts.budget.solUsd ?? kickoffSolUsd()
  const costSol = costSolFromUsd(item.costUsd, solUsd)
  const autoCapUsd = kickoffAutoApproveUsd()
  const auto = shouldAutoApprove({
    costUsd: item.costUsd,
    availableUsd: opts.budget.availableUsd,
    autoCapUsd,
  })
  const now = opts.now ?? Date.now()
  const proposal: KickoffProposal = {
    id: `ko_${randomBytes(8).toString('hex')}`,
    mint: opts.mint,
    itemId: item.id,
    label: item.label,
    costSol,
    costUsd: item.costUsd,
    solUsd,
    status: auto ? 'approved' : 'pending',
    payoutStatus: auto ? 'queued' : 'none',
    createdAt: now,
    decidedAt: auto ? now : undefined,
    decidedBy: auto ? 'auto' : undefined,
    autoApproved: auto || undefined,
    note: auto
      ? `Auto-approved (≤ $${autoCapUsd} USD cap, fully covered by remaining fee budget). Reserved. Queued for payout — no on-chain treasury transfer.`
      : autoCapUsd > 0 && item.costUsd > autoCapUsd
        ? `Pending admin approval ($${item.costUsd} > $${autoCapUsd} auto cap). Not reserved until approved. No treasury transfer.`
        : 'Pending admin approval. Cost is reserved only on approval. No treasury transfer.',
  }
  proposals.set(proposal.id, proposal)
  pushAudit({
    at: now,
    mint: opts.mint,
    proposalId: proposal.id,
    action: 'proposed',
    actor: 'system',
    costSol,
    costUsd: item.costUsd,
    autoCapUsd,
    remainingBudgetUsd: opts.budget.availableUsd,
    remainingBudgetSol: opts.budget.availableSol,
    detail: `Proposed ${item.id} at $${item.costUsd}`,
  })
  if (auto) {
    const remainingUsd = Math.max(0, opts.budget.availableUsd - item.costUsd)
    pushAudit({
      at: now,
      mint: opts.mint,
      proposalId: proposal.id,
      action: 'auto-approved',
      actor: 'auto',
      costSol,
      costUsd: item.costUsd,
      autoCapUsd,
      remainingBudgetUsd: remainingUsd,
      remainingBudgetSol: solUsd && solUsd > 0 ? remainingUsd / solUsd : opts.budget.availableSol,
      detail: `Auto-approved under CREW_KICKOFF_AUTO_USD=${autoCapUsd}. Reserved. Payout queued. No on-chain transfer.`,
    })
  }
  return proposal
}

/** Auto-queue cheapest fully-funded paid extras. Pending does not reserve; loop still respects remaining cover. */
export function maybeProposeEligible(opts: {
  mint: string
  budget: KickoffBudget
  traction: KickoffTraction
  dexscreener?: DexscreenerGate
  now?: number
}): KickoffProposal[] {
  if (!opts.traction.met) return []
  if (opts.budget.availableUsd == null) return []
  const created: KickoffProposal[] = []
  let available = opts.budget.availableUsd
  const sorted = kickoffCatalog({ mint: opts.mint, solUsd: opts.budget.solUsd })
    .filter((i) => !i.included && i.costUsd > 0)
    .sort((a, b) => a.costUsd - b.costUsd)
  for (const item of sorted) {
    const exists = listProposals(opts.mint).some(
      (p) => p.itemId === item.id && (p.status === 'pending' || p.status === 'approved'),
    )
    if (exists) continue
    if (item.costUsd - available > 1e-9) continue
    if (item.id === 'dexscreener' && !opts.dexscreener?.met) continue
    try {
      const p = proposeKickoff({
        mint: opts.mint,
        itemId: item.id,
        budget: { ...opts.budget, availableUsd: available },
        traction: opts.traction,
        dexscreener: opts.dexscreener,
        now: opts.now,
      })
      created.push(p)
      available = Math.max(0, available - item.costUsd)
    } catch {
      /* skip */
    }
  }
  return created
}

export type KickoffDecision = {
  proposal: KickoffProposal
  transfer: null
  automaticSpend: false
  note: string
}

export function decideKickoff(
  id: string,
  status: 'approved' | 'rejected',
  decidedBy: string,
  opts?: { availableUsd?: number | null; now?: number },
): KickoffDecision {
  const p = proposals.get(id)
  if (!p) throw new Error('Proposal not found')
  if (p.status !== 'pending') throw new Error(`Proposal already ${p.status}`)
  const now = opts?.now ?? Date.now()
  if (status === 'approved') {
    const available = opts?.availableUsd
    if (available != null && p.costUsd - available > 1e-9) {
      throw new Error(
        `Cost $${p.costUsd} exceeds remaining reserved budget $${available} — approval would double-spend`,
      )
    }
    p.status = 'approved'
    p.payoutStatus = 'queued'
    p.note =
      'Admin approved — cost reserved from this coin’s treasury fee budget, queued for payout. No automatic treasury transfer.'
  } else {
    p.status = 'rejected'
    p.payoutStatus = 'none'
    p.note = 'Rejected — nothing reserved. No transfer.'
  }
  p.decidedAt = now
  p.decidedBy = decidedBy
  p.autoApproved = false
  proposals.set(id, p)
  const remainingUsd =
    status === 'approved' && opts?.availableUsd != null
      ? Math.max(0, opts.availableUsd - p.costUsd)
      : opts?.availableUsd ?? null
  pushAudit({
    at: now,
    mint: p.mint,
    proposalId: p.id,
    action: status === 'approved' ? 'admin-approved' : 'rejected',
    actor: decidedBy,
    costSol: p.costSol,
    costUsd: p.costUsd,
    autoCapUsd: kickoffAutoApproveUsd(),
    remainingBudgetUsd: remainingUsd,
    remainingBudgetSol: 0,
    detail: p.note,
  })
  return {
    proposal: p,
    transfer: null,
    automaticSpend: false,
    note: p.note,
  }
}

export function kickoffPublicView(opts: {
  mint: string
  feesGeneratedSol?: number
  accruedSol?: number
  accruedEth?: number
  distributedSol?: number
  unclaimedSol?: number | null
  hasReferrer: boolean
  volumeUsd?: number
  holders?: number
  marketCapUsd?: number | null
  marketCapSol?: number | null
  platform?: FeePlatform
  graduated?: boolean
  solUsd?: number | null
  ethUsd?: number | null
  accruedAt?: number | null
  ttlMs?: number | null
  source?: string
}): {
  budget: KickoffBudget
  traction: KickoffTraction
  dexscreener: DexscreenerGate
  extras: KickoffExtra[]
  nextItem: KickoffNextItem | null
  freeTier: KickoffFreeTier
  projection: FeeProjection
  feeRates: ReturnType<typeof feeRatesPublic>
  proposals: KickoffProposal[]
  feeMap: string
  note: string
  autoApproveUsd: number
  audit: KickoffAuditEvent[]
} {
  const accruedSol = opts.accruedSol ?? opts.feesGeneratedSol ?? 0
  const traction = evaluateTraction({
    feesGeneratedSol: accruedSol,
    volumeUsd: opts.volumeUsd,
    holders: opts.holders,
  })
  const dexscreener = evaluateDexscreenerGate({
    volumeUsd: opts.volumeUsd,
    marketCapUsd: opts.marketCapUsd,
    marketCapSol: opts.marketCapSol,
    solUsd: opts.solUsd,
  })
  const budget = computeKickoffBudget({
    accruedSol,
    accruedEth: opts.accruedEth,
    distributedSol: opts.distributedSol,
    unclaimedSol: opts.unclaimedSol,
    hasReferrer: opts.hasReferrer,
    spentUsd: spentUsdFor(opts.mint),
    reservedUsd: reservedUsdFor(opts.mint),
    pendingUsd: pendingUsdFor(opts.mint),
    solUsd: opts.solUsd,
    ethUsd: opts.ethUsd,
    accruedAt: opts.accruedAt,
    ttlMs: opts.ttlMs,
    source: opts.source,
  })
  const extras = kickoffCatalog({ mint: opts.mint, solUsd: budget.solUsd }).map((item) => {
    const existing = listProposals(opts.mint).find((p) => p.itemId === item.id)
    const coverUsd =
      budget.availableUsd == null
        ? null
        : budget.availableUsd + (existing?.status === 'approved' ? item.costUsd : 0)
    const fundedAt = item.included
      ? {
          ...fundedAtProgress(0, coverUsd),
          label: `included · ${item.href || 'crewpay.dev/coin/<mint>'}`,
        }
      : fundedAtProgress(item.costUsd, coverUsd)
    const dsOk = item.id !== 'dexscreener' || dexscreener.met
    let state =
      existing?.status ||
      (item.included ? 'included' : !dsOk ? 'waiting-traction' : fundedAt.fullyFunded ? 'ready' : 'waiting-budget')
    if (!item.included && !traction.met && !existing) state = 'locked'
    const eligible =
      item.included ||
      (traction.met && dsOk && fundedAt.fullyFunded && !existing && item.costUsd > 0)
    return { ...item, eligible, state, fundedAt }
  })
  const nextPaid = extras
    .filter((e) => !e.included && e.costUsd > 0 && e.state !== 'approved')
    .sort((a, b) => a.costUsd - b.costUsd)[0]
  const nextItem: KickoffNextItem | null = nextPaid
    ? {
        id: nextPaid.id,
        label: nextPaid.label,
        costUsd: nextPaid.costUsd,
        fundedAt: nextPaid.fundedAt,
        tractionMet: nextPaid.id !== 'dexscreener' || dexscreener.met,
      }
    : null
  const x = crewXHandle()
  return {
    budget,
    traction,
    dexscreener,
    extras,
    nextItem,
    freeTier: {
      page: true,
      aiMemesPerDay: Math.max(0, Math.floor(numEnv('AI_CREW_MAX_PER_DAY', 3))),
      crewPost: true,
      sharedXHandle: x,
      dedicatedXAccount: false,
      note: `Free for every launch: hosted crewpay.dev page, a few AI memes/day, and crew posts from @${x}. No per-coin X account by default.`,
    },
    projection: projectCreatorFees({
      platform: opts.platform || 'pumpfun',
      volumeUsd: Number(opts.volumeUsd) || 0,
      mcapSol: dexscreener.marketCapSol,
      graduated: opts.graduated,
      hasReferrer: opts.hasReferrer,
    }),
    feeRates: feeRatesPublic(),
    proposals: listProposals(opts.mint),
    feeMap: opts.hasReferrer
      ? '60% KOL crew / 15% launching agent / 5% referrer / 20% treasury'
      : '60% KOL crew / 15% launching agent / 25% treasury',
    note: 'Free tier (page, AI memes, shared @crewpay posts) is always on. Paid extras unlock only after traction AND once this coin’s treasury share fully covers the item. Dexscreener Enhanced Token Info needs ~$100K volume or 1,000 SOL Pump mcap (configurable) plus full funding; list price may change. Approval reserves USD. CrewPay never auto-transfers treasury on-chain here.',
    autoApproveUsd: kickoffAutoApproveUsd(),
    audit: listKickoffAudit(opts.mint),
  }
}

export { PLATFORM_BUYBACK_BPS, AGENT_REFERRAL_BPS }
