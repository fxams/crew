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
  (t) => `$${t} — AI crew on the board. Humans still run the timeline.`,
  (t, n) => `${n} ($${t}). CrewPay page is live. KOLs get the 60%.`,
  (t) => `$${t} memes from the free AI desk. Hire humans for the real push.`,
  (t) => `Always-on AI captions for $${t}. No earnings talk — just the coin.`,
  (t, n) => `$${t} / ${n}. Fee map locked: 60% crew · 15% agent · 25% treasury.`,
  (t) => `Low-freq AI pack for $${t}. Creators claim the paid jobs.`,
]

export function captionFor(ticker: string, name: string, salt: number): string {
  const t = (ticker || 'COIN').replace(/^\$/, '').slice(0, 13).toUpperCase()
  const n = (name || t).slice(0, 32)
  const fn = CAPTION_FNS[Math.abs(salt) % CAPTION_FNS.length]!
  const text = fn(t, n)
  if (/guaranteed|roi|100x|moon soon/i.test(text)) return `$${t} — AI crew baseline. Humans get paid.`
  return text
}

export function svgMeme(ticker: string, caption: string): string {
  const t = xmlEscape((ticker || 'COIN').replace(/^\$/, '').toUpperCase().slice(0, 13))
  const c = xmlEscape(caption)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <rect width="400" height="400" fill="#08100c"/>
  <rect x="16" y="16" width="368" height="368" fill="none" stroke="#c8ff3d" stroke-width="3"/>
  <text x="200" y="86" text-anchor="middle" fill="#c8ff3d" font-family="ui-monospace, monospace" font-size="18" letter-spacing="4">AI CREW</text>
  <text x="200" y="168" text-anchor="middle" fill="#f2f6ef" font-family="Syne, sans-serif" font-size="56" font-weight="700">$${t}</text>
  <foreignObject x="36" y="210" width="328" height="120">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#f2f6ef;font:16px/1.35 'Work Sans',sans-serif;text-align:center">${c}</div>
  </foreignObject>
  <text x="200" y="366" text-anchor="middle" fill="#8f9a8a" font-family="ui-monospace, monospace" font-size="11">humans remain the core</text>
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
    svg: svgMeme(opts.ticker, caption),
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
  const n = aiCrewMaxPerDay()
  const handle = (process.env.CREW_X_HANDLE || 'crewpay').trim().replace(/^@/, '') || 'crewpay'
  return `Free tier: hosted coin page, ${n} AI meme${n === 1 ? '' : 's'}/day, and crew posts from @${handle}. No per-coin X account — small coins share CrewPay. Hired KOLs remain the core. No earnings promises.`
}
