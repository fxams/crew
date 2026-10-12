/** Creative job presets — keep ids in sync with agent/crew-api jobs/templates. */

export const COIN_JOB_TEMPLATE_IDS = [
  'meme-pack',
  'banner-logo',
  'x-upkeep',
  'website-polish',
] as const

export type CoinJobTemplateId = (typeof COIN_JOB_TEMPLATE_IDS)[number]

export type CoinJobTemplate = {
  id: CoinJobTemplateId
  label: string
  summary: string
  defaultBudget: number
  postsPerWeekDefault?: number
}

export const COIN_JOB_TEMPLATES: CoinJobTemplate[] = [
  {
    id: 'meme-pack',
    label: 'Meme pack',
    summary: 'Original meme images for the coin.',
    defaultBudget: 3,
  },
  {
    id: 'banner-logo',
    label: 'Banner/logo design',
    summary: 'Banner and/or logo set.',
    defaultBudget: 2,
  },
  {
    id: 'x-upkeep',
    label: 'X account upkeep',
    summary: 'N original posts per week on X.',
    defaultBudget: 2.5,
    postsPerWeekDefault: 5,
  },
  {
    id: 'website-polish',
    label: 'Website polish',
    summary: 'Tighten the public page or a linked site.',
    defaultBudget: 4,
  },
]

export const COIN_JOB_TEST_CHAINS = ['solana-devnet', 'evm:base-sepolia', 'flop-testnet'] as const
