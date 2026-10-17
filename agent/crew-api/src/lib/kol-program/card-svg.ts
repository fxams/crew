import type { ScoreBar } from './public-card.js'

export type KolCardHallBadge = { label: string; rank: number; seasonNumber: number }

export type KolCardInput = {
  handle: string
  displayName: string
  avatarUrl: string | null
  reachScore: number
  tier: string
  founderNumber: number | null
  referralUrl: string
  hallOfFameBadges?: KolCardHallBadge[]
  rank?: number | null
  unclaimed?: boolean
  scoreBars?: ScoreBar[]
}

const TIER_FRAME: Record<string, string> = {
  bronze: '#9cb3a8',
  silver: '#7eb8ff',
  gold: '#ffb84d',
  platinum: '#c8ff3d',
  spark: '#9cb3a8',
  pulse: '#7eb8ff',
  surge: '#ffb84d',
  apex: '#c8ff3d',
  legend: '#ff6bcb',
}

const TIER_LABEL: Record<string, string> = {
  bronze: 'SPARK',
  silver: 'PULSE',
  gold: 'SURGE',
  platinum: 'APEX',
}

function tierStroke(tier: string): string {
  const key = tier.toLowerCase()
  return TIER_FRAME[key] || TIER_FRAME.spark
}

function tierLabel(tier: string): string {
  const key = tier.toLowerCase()
  return TIER_LABEL[key] || tier.toUpperCase()
}

function renderBars(bars: ScoreBar[]): string {
  const startY = 380
  const barH = 14
  const gap = 22
  return bars
    .slice(0, 5)
    .map((b, i) => {
      const y = startY + i * gap
      const w = Math.max(4, Math.min(280, Math.round((b.value / 30) * 280)))
      return `<text x="720" y="${y + 11}" fill="#9cb3a8" font-size="14" font-family="ui-monospace,monospace">${escapeXml(b.label)}</text>
<rect x="820" y="${y}" width="280" height="${barH}" rx="4" fill="#1a2e22"/>
<rect x="820" y="${y}" width="${w}" height="${barH}" rx="4" fill="#c8ff3d" fill-opacity="0.85"/>`
    })
    .join('\n')
}

export function renderKolCardSvg(input: KolCardInput): string {
  const handle = escapeXml(input.handle.replace(/^@+/, ''))
  const name = escapeXml(input.displayName || handle)
  const tier = escapeXml(tierLabel(input.tier))
  const frame = input.unclaimed ? '#6d8478' : tierStroke(input.tier)
  const score = String(input.reachScore)
  const founder =
    input.founderNumber != null && input.founderNumber > 0
      ? `Founding KOL #${String(input.founderNumber).padStart(3, '0')}`
      : input.unclaimed
        ? 'UNCLAIMED · CrewPay KOL'
        : 'CrewPay KOL'
  const url = escapeXml(input.referralUrl)
  const rankLine =
    input.rank != null && input.rank > 0
      ? escapeXml(`Season rank #${input.rank}`)
      : input.unclaimed
        ? 'Claim at crewpay.dev/kol'
        : ''
  const hof =
    (input.hallOfFameBadges || [])
      .slice()
      .sort((a, b) => b.seasonNumber - a.seasonNumber)[0]?.label || ''
  const hofLine = hof ? escapeXml(hof) : ''
  const avatar = input.avatarUrl ? escapeXml(input.avatarUrl) : ''
  const avatarBlock = avatar
    ? `<image href="${avatar}" x="64" y="72" width="120" height="120" clip-path="url(#av)"/>`
    : `<circle cx="124" cy="132" r="60" fill="#1a2e22"/><text x="124" y="148" text-anchor="middle" fill="#c8ff3d" font-size="48" font-family="system-ui,sans-serif">@</text>`

  const bars = input.scoreBars?.length ? renderBars(input.scoreBars) : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <clipPath id="av"><circle cx="124" cy="132" r="60"/></clipPath>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#050a07"/>
      <stop offset="100%" stop-color="#0d1a12"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="24" y="24" width="1152" height="582" rx="24" fill="none" stroke="${frame}" stroke-opacity="0.9" stroke-width="4"/>
  ${avatarBlock}
  <text x="220" y="110" fill="#e8f5e9" font-size="44" font-weight="700" font-family="system-ui,sans-serif">@${handle}</text>
  <text x="220" y="156" fill="#9cb3a8" font-size="26" font-family="system-ui,sans-serif">${name}</text>
  <text x="220" y="200" fill="#c8ff3d" font-size="22" font-family="ui-monospace,monospace">${escapeXml(founder)}</text>
  ${rankLine ? `<text x="220" y="232" fill="#9cb3a8" font-size="18" font-family="ui-monospace,monospace">${rankLine}</text>` : ''}
  ${hofLine ? `<text x="220" y="258" fill="#9cb3a8" font-size="16" font-family="ui-monospace,monospace">${hofLine}</text>` : ''}
  <text x="220" y="320" fill="#e8f5e9" font-size="72" font-weight="800" font-family="system-ui,sans-serif">${score}</text>
  <text x="340" y="320" fill="#9cb3a8" font-size="28" font-family="ui-monospace,monospace">reach</text>
  <text x="220" y="372" fill="#c8ff3d" font-size="32" font-weight="600" font-family="ui-monospace,monospace">${tier}</text>
  ${bars}
  <text x="64" y="560" fill="#9cb3a8" font-size="22" font-family="ui-monospace,monospace">${url}</text>
  <text x="64" y="598" fill="#6d8478" font-size="16" font-family="ui-monospace,monospace">Points have no cash value. Season pool varies with real fees — not guaranteed.</text>
</svg>`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
