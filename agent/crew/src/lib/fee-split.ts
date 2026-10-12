import { KOL_REFERRAL_CUT_PCT, MODE_DESK_BPS, PLATFORM_BUYBACK_BPS } from './config'

export type CreatorFeeSplit = {
  crew: number
  agent: number
  referrer: number
  treasury: number
}

/**
 * On-chain creator-fee map for the public “Who gets paid” bar.
 * Default 60 / 15 / 25. Referred 60 / 15 / 5 / 20 (referrer carved from treasury).
 */
export function creatorFeeSplit(referred: boolean): CreatorFeeSplit {
  const agent = MODE_DESK_BPS.agent / 100
  const crew = 100 - PLATFORM_BUYBACK_BPS / 100 - agent
  const referrer = referred ? KOL_REFERRAL_CUT_PCT : 0
  const treasury = PLATFORM_BUYBACK_BPS / 100 - referrer
  return { crew, agent, referrer, treasury }
}

export const FEE_SPLIT_DEFAULT = creatorFeeSplit(false)
export const FEE_SPLIT_REFERRED = creatorFeeSplit(true)
