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
  memberNumber?: number | null
  seasonPoints?: number
  unclaimed?: boolean
  scoreBars?: ScoreBar[]
}

const TIER_LABEL: Record<string, string> = {
  bronze: 'SPARK',
  silver: 'PULSE',
  gold: 'SURGE',
  platinum: 'APEX',
  spark: 'SPARK',
  pulse: 'PULSE',
  surge: 'SURGE',
  apex: 'APEX',
  legend: 'LEGEND',
}

const LIME = '#c8ff3d'
const MUTED = '#8fa89a'
const INK = '#e8f5e9'

function tierLabel(tier: string): string {
  return TIER_LABEL[tier.toLowerCase()] || tier.toUpperCase()
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function segmentedMeter(x: number, y: number, value: number, segments = 12): string {
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * segments)
  const w = 10
  const h = 16
  const gap = 3
  let out = ''
  for (let i = 0; i < segments; i++) {
    const sx = x + i * (w + gap)
    const on = i < filled
    out += `<rect x="${sx}" y="${y}" width="${w}" height="${h}" rx="2" fill="${on ? LIME : '#1a2e22'}" fill-opacity="${on ? 0.95 : 0.5}" transform="skewX(-12)"/>`
  }
  return out
}

function renderBars(bars: ScoreBar[]): string {
  const startY = 248
  const rowH = 36
  return bars
    .slice(0, 6)
    .map((b, i) => {
      const y = startY + i * rowH
      return `<text x="56" y="${y + 14}" fill="${MUTED}" font-size="13" font-family="Roboto,sans-serif" letter-spacing="0.04em">${escapeXml(b.label.toUpperCase())}</text>
${segmentedMeter(280, y, b.value)}
<text x="520" y="${y + 14}" fill="${INK}" font-size="14" font-family="Roboto,sans-serif" text-anchor="end">${Math.max(0, Math.min(100, b.value))}</text>`
    })
    .join('\n')
}

/** Chamfered frame path (inset from 0,0). */
function framePath(w: number, h: number, inset: number, chamfer: number): string {
  const x0 = inset
  const y0 = inset
  const x1 = w - inset
  const y1 = h - inset
  const c = chamfer
  return `M ${x0 + c} ${y0} L ${x1 - c} ${y0} L ${x1} ${y0 + c} L ${x1} ${y1 - c} L ${x1 - c} ${y1} L ${x0 + c} ${y1} L ${x0} ${y1 - c} L ${x0} ${y0 + c} Z`
}

export function renderKolCardSvg(input: KolCardInput): string {
  const handle = escapeXml(input.handle.replace(/^@+/, ''))
  const name = escapeXml(input.displayName || handle)
  const tier = escapeXml(tierLabel(input.tier))
  const score = String(input.reachScore)
  const pts = String(Math.max(0, input.seasonPoints ?? 0))
  const globalRank =
    input.rank != null && input.rank > 0 ? `GLOBAL RANK #${input.rank.toLocaleString('en-US')}` : 'GLOBAL RANK —'
  const memberNo =
    input.memberNumber != null && input.memberNumber > 0
      ? `MEMBER #${input.memberNumber.toLocaleString('en-US')}`
      : input.founderNumber != null
        ? `FOUNDING #${String(input.founderNumber).padStart(3, '0')}`
        : 'MEMBER —'
  const avatar = input.avatarUrl ? escapeXml(input.avatarUrl) : ''
  const avatarBlock = avatar
    ? `<image href="${avatar}" x="872" y="300" width="128" height="128" clip-path="url(#av)"/>`
    : `<rect x="872" y="300" width="128" height="128" fill="#0d1a12" stroke="${LIME}" stroke-width="3"/><text x="936" y="378" text-anchor="middle" fill="${LIME}" font-size="48" font-family="Roboto,sans-serif">@</text>`
  const bars = input.scoreBars?.length ? renderBars(input.scoreBars) : ''
  const quote = input.unclaimed
    ? 'CLAIM YOUR CARD · CREWPAY KOL'
    : 'REACH IS A SIGNAL · USE IT WISELY'

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <clipPath id="av"><rect x="872" y="300" width="128" height="128" rx="8"/></clipPath>
    <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="${LIME}" fill-opacity="0.12"/>
    </pattern>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="#050a07"/>
  <rect width="1200" height="630" fill="url(#dots)"/>
  <path d="${framePath(1200, 630, 20, 28)}" fill="none" stroke="${LIME}" stroke-width="4" filter="url(#glow)"/>
  <rect x="36" y="36" width="1128" height="558" fill="#050a07" fill-opacity="0.72"/>
  <text x="56" y="72" fill="${LIME}" font-size="22" font-weight="700" font-family="Roboto,sans-serif" letter-spacing="0.2em">CREWPAY KOL</text>
  <text x="56" y="98" fill="${MUTED}" font-size="12" font-family="Roboto,sans-serif" letter-spacing="0.08em">REAL REACH · SEASON POINTS · NO CASH VALUE</text>
  <text x="1144" y="72" fill="${LIME}" font-size="14" font-family="Roboto,sans-serif" text-anchor="end">${escapeXml(globalRank)}</text>
  <text x="1144" y="94" fill="${MUTED}" font-size="13" font-family="Roboto,sans-serif" text-anchor="end">${escapeXml(memberNo)}</text>
  <rect x="1020" y="108" width="124" height="32" rx="16" fill="none" stroke="${LIME}" stroke-width="2"/>
  <text x="1082" y="130" fill="${LIME}" font-size="14" font-weight="700" font-family="Roboto,sans-serif" text-anchor="middle">${tier}</text>
  <text x="56" y="168" fill="${MUTED}" font-size="13" font-family="Roboto,sans-serif" letter-spacing="0.12em">REACH SCORE</text>
  <text x="56" y="228" fill="${LIME}" font-size="88" font-weight="800" font-family="Roboto,sans-serif" filter="url(#glow)">${score}</text>
  <text x="56" y="258" fill="${INK}" font-size="22" font-family="Roboto,sans-serif">${pts} SEASON PTS</text>
  ${bars}
  ${avatarBlock}
  <text x="936" y="456" fill="${LIME}" font-size="32" font-style="italic" font-family="Roboto,sans-serif" text-anchor="middle">${name}</text>
  <text x="936" y="486" fill="${MUTED}" font-size="16" font-family="Roboto,sans-serif" text-anchor="middle">@${handle}</text>
  <text x="936" y="520" fill="${MUTED}" font-size="11" font-family="Roboto,sans-serif" text-anchor="middle" letter-spacing="0.06em">${escapeXml(quote)}</text>
  <rect x="800" y="536" width="272" height="44" rx="8" fill="none" stroke="${LIME}" stroke-width="2"/>
  <text x="936" y="564" fill="${LIME}" font-size="12" font-weight="700" font-family="Roboto,sans-serif" text-anchor="middle" letter-spacing="0.06em">SHARE YOUR KOL CARD ON X</text>
  <text x="56" y="598" fill="${MUTED}" font-size="14" font-family="Roboto,sans-serif" letter-spacing="0.14em">CREWPAY.DEV</text>
</svg>`
}
