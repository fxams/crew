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

export function renderKolCardSvg(input: KolCardInput): string {
  const handle = escapeXml(input.handle.replace(/^@+/, ''))
  const name = escapeXml(input.displayName || handle)
  const tier = escapeXml(tierLabel(input.tier))
  const frame = tierStroke(input.tier)
  const score = String(input.reachScore)
  const founder =
    input.founderNumber != null && input.founderNumber > 0
      ? `Founding KOL #${String(input.founderNumber).padStart(3, '0')}`
      : 'CrewPay KOL'
  const url = escapeXml(input.referralUrl)
  const hof =
    (input.hallOfFameBadges || [])
      .slice()
      .sort((a, b) => b.seasonNumber - a.seasonNumber)[0]?.label || ''
  const hofLine = hof ? escapeXml(hof) : ''
  const avatar = input.avatarUrl ? escapeXml(input.avatarUrl) : ''
  const avatarBlock = avatar
    ? `<image href="${avatar}" x="40" y="48" width="72" height="72" clip-path="url(#av)"/>`
    : `<circle cx="76" cy="84" r="36" fill="#1a2e22"/><text x="76" y="92" text-anchor="middle" fill="#c8ff3d" font-size="28" font-family="system-ui,sans-serif">@</text>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="315" viewBox="0 0 600 315">
  <defs>
    <clipPath id="av"><circle cx="76" cy="84" r="36"/></clipPath>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#050a07"/>
      <stop offset="100%" stop-color="#0d1a12"/>
    </linearGradient>
  </defs>
  <rect width="600" height="315" fill="url(#bg)"/>
  <rect x="12" y="12" width="576" height="291" rx="16" fill="none" stroke="${frame}" stroke-opacity="0.85" stroke-width="3"/>
  ${avatarBlock}
  <text x="140" y="72" fill="#e8f5e9" font-size="26" font-weight="700" font-family="system-ui,sans-serif">@${handle}</text>
  <text x="140" y="98" fill="#9cb3a8" font-size="16" font-family="system-ui,sans-serif">${name}</text>
  <text x="140" y="132" fill="#c8ff3d" font-size="14" font-family="ui-monospace,monospace">${founder}</text>
  ${hofLine ? `<text x="140" y="152" fill="#9cb3a8" font-size="12" font-family="ui-monospace,monospace">${hofLine}</text>` : ''}
  <text x="140" y="168" fill="#e8f5e9" font-size="42" font-weight="800" font-family="system-ui,sans-serif">${score}</text>
  <text x="220" y="168" fill="#9cb3a8" font-size="16" font-family="ui-monospace,monospace">reach</text>
  <text x="140" y="200" fill="#c8ff3d" font-size="18" font-weight="600" font-family="ui-monospace,monospace">${tier}</text>
  <text x="40" y="252" fill="#9cb3a8" font-size="13" font-family="ui-monospace,monospace">${url}</text>
  <text x="40" y="278" fill="#6d8478" font-size="11" font-family="ui-monospace,monospace">Agent referral fee map: 60% crew / 15% agent / 5% referrer / 20% treasury (when bound). No earnings promises.</text>
</svg>`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
