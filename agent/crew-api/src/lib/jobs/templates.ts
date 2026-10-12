import type { AssetSymbol, CampaignRules, ChainId, JobType } from './types.js'

export const COIN_JOB_TEMPLATE_IDS = [
  'meme-pack',
  'banner-logo',
  'x-upkeep',
  'website-polish',
] as const

export type CoinJobTemplateId = (typeof COIN_JOB_TEMPLATE_IDS)[number]

/** Test/devnet chains only — coin jobs never target mainnet. */
export const COIN_JOB_CHAIN_IDS = ['solana-devnet', 'evm:base-sepolia', 'flop-testnet'] as const
export type CoinJobChainId = (typeof COIN_JOB_CHAIN_IDS)[number]

export type CoinJobTemplate = {
  id: CoinJobTemplateId
  label: string
  type: JobType
  summary: string
  deliverable: string
  defaultBudget: number
  defaultPerProof: number
  defaultMaxProofs: number
  defaultPerKOLCap: number
  defaultDeadlineHours: number
  minUrls: number
  platform: 'x' | 'any'
  postsPerWeekDefault?: number
}

export const COIN_JOB_TEMPLATES: CoinJobTemplate[] = [
  {
    id: 'meme-pack',
    label: 'Meme pack',
    type: 'content',
    summary: 'Original meme images for the coin — a small pack, not a feed.',
    deliverable: 'HTTPS links to original meme images (IPFS, Imgur, Drive, or similar).',
    defaultBudget: 3,
    defaultPerProof: 0.5,
    defaultMaxProofs: 6,
    defaultPerKOLCap: 6,
    defaultDeadlineHours: 72,
    minUrls: 4,
    platform: 'any',
  },
  {
    id: 'banner-logo',
    label: 'Banner/logo design',
    type: 'design',
    summary: 'A banner and/or logo set that matches the coin name and ticker.',
    deliverable: 'HTTPS link to the design file or a public preview (Figma, IPFS, GitHub).',
    defaultBudget: 2,
    defaultPerProof: 1,
    defaultMaxProofs: 2,
    defaultPerKOLCap: 2,
    defaultDeadlineHours: 72,
    minUrls: 1,
    platform: 'any',
  },
  {
    id: 'x-upkeep',
    label: 'X account upkeep',
    type: 'community',
    summary: 'N original posts per week on X that mention the ticker or coin page.',
    deliverable: 'X/Twitter status URLs. Paid per verified post, capped at N per week.',
    defaultBudget: 2.5,
    defaultPerProof: 0.5,
    defaultMaxProofs: 5,
    defaultPerKOLCap: 5,
    defaultDeadlineHours: 168,
    minUrls: 1,
    platform: 'x',
    postsPerWeekDefault: 5,
  },
  {
    id: 'website-polish',
    label: 'Website polish',
    type: 'design',
    summary: 'Tighten the public coin page or a linked site — copy, layout, or a one-pager.',
    deliverable: 'HTTPS URL of the polished page or a PR/preview.',
    defaultBudget: 4,
    defaultPerProof: 2,
    defaultMaxProofs: 2,
    defaultPerKOLCap: 2,
    defaultDeadlineHours: 120,
    minUrls: 1,
    platform: 'any',
  },
]

export function isCoinJobTemplateId(value: unknown): value is CoinJobTemplateId {
  return typeof value === 'string' && (COIN_JOB_TEMPLATE_IDS as readonly string[]).includes(value)
}

export function getCoinJobTemplate(id: string): CoinJobTemplate {
  const found = COIN_JOB_TEMPLATES.find((t) => t.id === id)
  if (!found) throw new Error(`Unknown coin job template: ${id}`)
  return found
}

export function isCoinJobChainId(value: unknown): value is CoinJobChainId {
  return typeof value === 'string' && (COIN_JOB_CHAIN_IDS as readonly string[]).includes(value)
}

export type AppliedCoinJob = {
  type: JobType
  chainId: ChainId
  asset: AssetSymbol
  budget: number
  perProofAmount: number
  maxProofs: number
  perKOLCap: number
  deadlineHours: number
  mint: string
  templateId: CoinJobTemplateId
  rules: CampaignRules
}

export function applyCoinJobTemplate(input: {
  template: CoinJobTemplateId | string
  mint: string
  ticker?: string
  pageUrl?: string
  budget?: number
  perProofAmount?: number
  maxProofs?: number
  perKOLCap?: number
  deadlineHours?: number
  postsPerWeek?: number
  chainId: ChainId
  asset: AssetSymbol
}): AppliedCoinJob {
  if (!isCoinJobChainId(input.chainId)) {
    throw new Error('Coin jobs are test/devnet only (solana-devnet, evm:base-sepolia, flop-testnet)')
  }
  const tmpl = getCoinJobTemplate(input.template)
  const postsPerWeek =
    tmpl.id === 'x-upkeep'
      ? Math.min(21, Math.max(1, Math.round(input.postsPerWeek || tmpl.postsPerWeekDefault || 5)))
      : undefined
  const weeks = Math.max(1, Math.ceil((input.deadlineHours || tmpl.defaultDeadlineHours) / 168))
  const maxProofs =
    input.maxProofs ??
    (tmpl.id === 'x-upkeep' && postsPerWeek ? postsPerWeek * weeks : tmpl.defaultMaxProofs)
  const perProofAmount = input.perProofAmount ?? tmpl.defaultPerProof
  const budget =
    input.budget ??
    (tmpl.id === 'x-upkeep' ? Number((perProofAmount * maxProofs).toFixed(6)) : tmpl.defaultBudget)

  const ticker = (input.ticker || '').replace(/^\$/, '').trim()
  const pageUrl = (input.pageUrl || '').trim()

  const rules: CampaignRules = {
    // X upkeep proofs should mention ticker / coin page; creative URLs usually will not.
    requiredTicker: tmpl.platform === 'x' ? ticker || undefined : undefined,
    requiredLink: tmpl.platform === 'x' ? pageUrl || undefined : undefined,
    minPostAgeHours: 0,
    platform: tmpl.platform,
    deliverableKind: tmpl.id,
    minUrls: tmpl.minUrls,
    postsPerWeek,
  }

  return {
    type: tmpl.type,
    chainId: input.chainId,
    asset: input.asset,
    budget,
    perProofAmount,
    maxProofs,
    perKOLCap: input.perKOLCap ?? tmpl.defaultPerKOLCap,
    deadlineHours: input.deadlineHours ?? tmpl.defaultDeadlineHours,
    mint: input.mint,
    templateId: tmpl.id,
    rules,
  }
}

export function listCoinJobTemplates() {
  return COIN_JOB_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.label,
    type: t.type,
    summary: t.summary,
    deliverable: t.deliverable,
    defaultBudget: t.defaultBudget,
    defaultPerProof: t.defaultPerProof,
    defaultMaxProofs: t.defaultMaxProofs,
    defaultPerKOLCap: t.defaultPerKOLCap,
    defaultDeadlineHours: t.defaultDeadlineHours,
    minUrls: t.minUrls,
    platform: t.platform,
    postsPerWeekDefault: t.postsPerWeekDefault,
    note: 'Test/devnet escrow only. Humans claim, deliver, and are paid after verification. No earnings promises.',
  }))
}
