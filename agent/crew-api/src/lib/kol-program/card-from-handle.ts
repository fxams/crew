import { renderKolCardSvg } from './card-svg.js'
import { cardInputForHandle } from './public-card.js'

export async function cardSvgForAnyHandle(handle: string): Promise<string | null> {
  const h = handle.replace(/^@+/, '').trim()
  if (!h) return null
  const { card, badges } = await cardInputForHandle(h)
  return renderKolCardSvg({
    handle: card.handle,
    displayName: card.displayName,
    avatarUrl: card.avatarUrl,
    reachScore: card.reachScore,
    notionalInfluenceValueUsd: card.notionalInfluenceValueUsd,
    tier: card.tier,
    founderNumber: card.founderNumber,
    referralUrl: card.referralUrl,
    hallOfFameBadges: badges,
    rank: card.rank,
    memberNumber: card.memberNumber,
    seasonPoints: card.seasonPoints,
    unclaimed: card.unclaimed,
    scoreBars: card.scoreBars,
  })
}
