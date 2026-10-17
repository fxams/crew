import type { ScoreBar } from './public-card.js'

export type KolCardHallBadge = { label: string; rank: number; seasonNumber: number }

export type KolCardInput = {
  handle: string
  displayName: string
  avatarUrl: string | null
  reachScore: number
  notionalInfluenceValueUsd: number
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
const LIME_HI = '#f3ffb0'
const MUTED = '#9ec9b0'
const INK = '#f4ffe8'

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

function segmentedMeter(x: number, y: number, value: number | null, segments = 12): string {
  const filled = value == null ? 0 : Math.round((Math.max(0, Math.min(100, value)) / 100) * segments)
  const w = 11
  const h = 15
  const gap = 3
  let out = ''
  for (let i = 0; i < segments; i++) {
    const sx = x + i * (w + gap)
    const on = i < filled
    out += on
      ? `<rect x="${sx}" y="${y}" width="${w}" height="${h}" rx="2" fill="url(#barOn)" filter="url(#barGlow)" transform="skewX(-12)"/>`
      : `<rect x="${sx}" y="${y}" width="${w}" height="${h}" rx="2" fill="#0c2218" stroke="${LIME}" stroke-opacity="0.22" stroke-width="0.8" transform="skewX(-12)"/>`
  }
  return out
}

function renderBars(bars: ScoreBar[]): string {
  const startY = 148
  const rowH = 34
  return bars
    .slice(0, 6)
    .map((b, i) => {
      const y = startY + i * rowH
      const shown = b.value == null ? '—' : String(Math.max(0, Math.min(100, b.value)))
      return `<text x="560" y="${y + 13}" fill="${MUTED}" font-size="12" font-family="Roboto,sans-serif" letter-spacing="0.04em">${escapeXml(b.label.toUpperCase())}</text>
${segmentedMeter(720, y, b.value)}
<text x="1144" y="${y + 13}" fill="${b.value == null ? MUTED : LIME_HI}" font-size="15" font-weight="700" font-family="Roboto,sans-serif" text-anchor="end">${shown}</text>`
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
  const notional = `$${Math.max(0, Math.round(input.notionalInfluenceValueUsd)).toLocaleString('en-US')}`
  const showRank = !input.unclaimed && input.rank != null && input.rank > 0
  const showMember =
    !input.unclaimed &&
    ((input.memberNumber != null && input.memberNumber > 0) || input.founderNumber != null)
  const globalRank = showRank ? `GLOBAL RANK #${input.rank!.toLocaleString('en-US')}` : ''
  const memberNo = showMember
    ? input.memberNumber != null && input.memberNumber > 0
      ? `MEMBER #${input.memberNumber.toLocaleString('en-US')}`
      : `FOUNDING #${String(input.founderNumber).padStart(3, '0')}`
    : ''
  const avatar = input.avatarUrl ? escapeXml(input.avatarUrl) : ''
  const avatarBlock = avatar
    ? `<image href="${avatar}" x="56" y="118" width="88" height="88" clip-path="url(#av)"/>`
    : `<rect x="56" y="118" width="88" height="88" fill="#0d1a12" stroke="${LIME}" stroke-width="2"/><text x="100" y="174" text-anchor="middle" fill="${LIME}" font-size="36" font-family="Roboto,sans-serif">@</text>`
  const bars = input.scoreBars?.length ? renderBars(input.scoreBars) : ''
  const hasUnavailable = Boolean(input.scoreBars?.some((b) => b.value == null))
  const quote = input.unclaimed
    ? 'CLAIM YOUR CARD · CREWPAY KOL'
    : 'REACH IS A SIGNAL · USE IT WISELY'

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <clipPath id="av"><rect x="56" y="118" width="88" height="88" rx="8"/></clipPath>
    <radialGradient id="wash" cx="32%" cy="28%" r="70%">
      <stop offset="0%" stop-color="#1d3a18" stop-opacity="0.95"/>
      <stop offset="55%" stop-color="#08140e" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#050a07" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="barOn" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${LIME_HI}"/>
      <stop offset="100%" stop-color="${LIME}"/>
    </linearGradient>
    <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="${LIME}" fill-opacity="0.16"/>
    </pattern>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="heroGlow" x="-30%" y="-40%" width="160%" height="180%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="barGlow" x="-40%" y="-60%" width="180%" height="220%">
      <feGaussianBlur stdDeviation="2.4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#wash)"/>
  <rect width="1200" height="630" fill="url(#dots)"/>
  <path d="${framePath(1200, 630, 16, 26)}" fill="none" stroke="${LIME}" stroke-width="5" filter="url(#glow)"/>
  <text x="56" y="68" fill="${LIME}" font-size="20" font-weight="700" font-family="Roboto,sans-serif" letter-spacing="0.2em">CREWPAY KOL</text>
  <text x="56" y="90" fill="${MUTED}" font-size="11" font-family="Roboto,sans-serif" letter-spacing="0.08em">REAL REACH · SEASON POINTS · NO CASH VALUE</text>
  ${globalRank ? `<text x="1008" y="64" fill="${LIME}" font-size="13" font-family="Roboto,sans-serif" text-anchor="end">${escapeXml(globalRank)}</text>` : ''}
  ${memberNo ? `<text x="1008" y="84" fill="${MUTED}" font-size="12" font-family="Roboto,sans-serif" text-anchor="end">${escapeXml(memberNo)}</text>` : ''}
  <rect x="1024" y="50" width="120" height="30" rx="15" fill="rgba(200,255,61,0.12)" stroke="${LIME}" stroke-width="2"/>
  <text x="1084" y="71" fill="${LIME}" font-size="13" font-weight="700" font-family="Roboto,sans-serif" text-anchor="middle">${tier}</text>
  ${avatarBlock}
  <text x="160" y="158" fill="${LIME}" font-size="30" font-style="italic" font-family="Roboto,sans-serif">${name}</text>
  <text x="160" y="186" fill="${MUTED}" font-size="16" font-family="Roboto,sans-serif">@${handle}</text>
  <text x="56" y="246" fill="${MUTED}" font-size="11" font-family="Roboto,sans-serif" letter-spacing="0.12em">NOTIONAL INFLUENCE VALUE</text>
  <text x="56" y="318" fill="${LIME_HI}" font-size="76" font-weight="800" font-family="Roboto,sans-serif" filter="url(#heroGlow)">${escapeXml(notional)}</text>
  <text x="56" y="346" fill="${MUTED}" font-size="11" font-family="Roboto,sans-serif">NOTIONAL, BASED ON PUBLIC X METRICS. NOT EARNINGS OR A PAYOUT.</text>
  <text x="56" y="376" fill="${INK}" font-size="14" font-family="Roboto,sans-serif" letter-spacing="0.06em">REACH SCORE ${score} · ${pts} SEASON PTS</text>
  ${bars}
  ${hasUnavailable ? `<text x="560" y="368" fill="${MUTED}" font-size="11" font-family="Roboto,sans-serif">— needs public posts or a claimed card</text>` : ''}
  <text x="56" y="430" fill="${MUTED}" font-size="12" font-family="Roboto,sans-serif" letter-spacing="0.06em">${escapeXml(quote)}</text>
  <rect x="56" y="448" width="300" height="44" rx="8" fill="rgba(200,255,61,0.08)" stroke="${LIME}" stroke-width="2" filter="url(#glow)"/>
  <text x="206" y="476" fill="${LIME}" font-size="12" font-weight="700" font-family="Roboto,sans-serif" text-anchor="middle" letter-spacing="0.06em">SHARE YOUR KOL CARD ON X</text>
  <text x="56" y="598" fill="${MUTED}" font-size="14" font-family="Roboto,sans-serif" letter-spacing="0.14em">CREWPAY.DEV</text>
</svg>`
}
