/**
 * Free-tier AI crew — always-on baseline for every CrewPay-launched coin.
 * Lightweight captions + SVG memes. No external model keys. Humans remain the core.
 */

import { randomBytes } from 'node:crypto'

export type AiCrewItem = {
  id: string
  mint: string
  caption: string
  svg: string
  createdAt: number
  source: 'ai-crew'
}

const items = new Map<string, AiCrewItem>()

export function resetAiCrew() {
  items.clear()
}

export function aiCrewMaxPerDay(): number {
  const n = Number(process.env.AI_CREW_MAX_PER_DAY)
  if (Number.isFinite(n) && n >= 0) return Math.min(24, Math.floor(n))
  return 3
}

export function aiCrewMinIntervalMs(): number {
  const hours = Number(process.env.AI_CREW_MIN_INTERVAL_HOURS)
  if (Number.isFinite(hours) && hours >= 0) return hours * 60 * 60_000
  return 4 * 60 * 60_000
}

export function aiCrewEnabled(): boolean {
  const v = (process.env.AI_CREW_ENABLED || 'true').trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'off'
}

function xmlEscape(s: string): string {
  return String(s || '')
    .slice(0, 80)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const CAPTION_FNS: Array<(ticker: string, name: string) => string> = [
  (t) => `$${t} — AI crew on the board.`,
  (t, n) => `${n} ($${t}). CrewPay page is live.`,
  (t) => `$${t} memes from the free AI desk.`,
  (t) => `Always-on AI pack for $${t}.`,
  (t, n) => `$${t} / ${n}. Humans stay the core.`,
  (t) => `Low-freq AI pack for $${t}.`,
]

const EARNINGS_TALK = /guaranteed|roi|100x|moon soon|60%|get paid|earn/i

export function captionFor(ticker: string, name: string, salt: number): string {
  const t = (ticker || 'COIN').replace(/^\$/, '').slice(0, 16).toUpperCase()
  const n = (name || t).slice(0, 32)
  const fn = CAPTION_FNS[Math.abs(salt) % CAPTION_FNS.length]!
  const text = fn(t, n)
  if (EARNINGS_TALK.test(text)) return `$${t} — AI crew baseline.`
  return text
}

/** Shrink bold $TICKER so it stays inside the 320px meme title band. */
export function fitTickerFontSize(
  ticker: string,
  opts: { maxWidth?: number; maxSize?: number; minSize?: number } = {},
): number {
  const display = `$${(ticker || 'COIN').replace(/^\$/, '').toUpperCase().slice(0, 16)}`
  const maxWidth = opts.maxWidth ?? 320
  const maxSize = opts.maxSize ?? 52
  const minSize = opts.minSize ?? 16
  const char = 0.7
  const raw = Math.floor(maxWidth / Math.max(1, display.length * char))
  return Math.max(minSize, Math.min(maxSize, raw))
}

export function svgMeme(
  ticker: string,
  opts: { imageHref?: string; mark?: string } = {},
): string {
  const raw = (ticker || 'COIN').replace(/^\$/, '').toUpperCase().slice(0, 16)
  const t = xmlEscape(raw)
  const clipId = `ai-logo-${raw.toLowerCase().replace(/[^a-z0-9]/g, '') || 'coin'}`
  const mark = xmlEscape((opts.mark || raw).slice(0, 1) || '?')
  const fontSize = fitTickerFontSize(raw)
  const display = `$${t}`
  const estimated = display.length * fontSize * 0.7
  const fit =
    estimated > 320 ? ` textLength="320" lengthAdjust="spacingAndGlyphs"` : ''
  const href = opts.imageHref ? xmlEscape(opts.imageHref) : ''
  const logo = href
    ? `<image href="${href}" x="156" y="72" width="88" height="88" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <clipPath id="${clipId}"><circle cx="200" cy="116" r="44"/></clipPath>
  </defs>
  <rect width="400" height="400" rx="28" fill="#0d1611"/>
  <rect x="14" y="14" width="372" height="372" rx="22" fill="none" stroke="#c8ff3d" stroke-opacity="0.35" stroke-width="2"/>
  <circle cx="200" cy="116" r="44" fill="rgba(200,255,61,0.12)" stroke="#c8ff3d" stroke-width="2"/>
  <text x="200" y="130" text-anchor="middle" fill="#c8ff3d" font-family="Syne, sans-serif" font-size="34" font-weight="700">${mark}</text>
  ${logo}
  <text x="200" y="236" text-anchor="middle" fill="#f2f6ef" font-family="Syne, sans-serif" font-size="${fontSize}" font-weight="700"${fit}>${display}</text>
  <text x="200" y="348" text-anchor="middle" fill="#8f9a8a" font-family="ui-monospace, monospace" font-size="12" letter-spacing="3">AI CREW</text>
</svg>`
}

function utcDayKey(ms = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function listAiCrew(mint: string): AiCrewItem[] {
  return [...items.values()]
    .filter((i) => i.mint === mint)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function generateAiCrewItem(opts: {
  mint: string
  ticker: string
  name: string
  now?: number
}): AiCrewItem | null {
  if (!aiCrewEnabled()) return null
  const now = opts.now ?? Date.now()
  const max = aiCrewMaxPerDay()
  if (max <= 0) return null
  const today = utcDayKey(now)
  const existing = listAiCrew(opts.mint)
  const todayItems = existing.filter((i) => utcDayKey(i.createdAt) === today)
  if (todayItems.length >= max) return null
  const latest = existing[0]
  if (latest && now - latest.createdAt < aiCrewMinIntervalMs()) return null
  const caption = captionFor(opts.ticker, opts.name, todayItems.length + now)
  const item: AiCrewItem = {
    id: `ai_${randomBytes(6).toString('hex')}`,
    mint: opts.mint,
    caption,
    svg: svgMeme(opts.ticker, {
      mark: opts.ticker,
      imageHref: `https://api.crewpay.dev/api/coins/${encodeURIComponent(opts.mint)}/logo`,
    }),
    createdAt: now,
    source: 'ai-crew',
  }
  items.set(item.id, item)
  return item
}

export function ensureAiCrew(opts: {
  mint: string
  ticker: string
  name: string
  now?: number
}): AiCrewItem[] {
  generateAiCrewItem(opts)
  return listAiCrew(opts.mint)
}

export function aiCrewPublicNote(): string {
  return 'Lightweight AI memes. Humans stay the core.'
}
