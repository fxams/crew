import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import type { Response } from 'express'
import { siteUrl } from './kol-register.js'
import { injectSpaIndexMeta, loadSiteIndexHtml, type SharePageMeta } from './kol-program/share-html.js'
import {
  chartsUpstreamUrl,
  fetchSquadsUpstream,
  squadsUpstreamOrigin,
  tokenChartUpstreamUrl,
  validateMint,
  validateSquadId,
} from './squads-proxy.js'

export const SQUADS_ACTIVITY_PATH = '/squads/activity'
export const SQUADS_ACTIVITY_CARD_PATH = '/api/squads/activity-card.png'

type ChartsBody = {
  squads?: Array<{
    id?: string
    name?: string
    tokens?: Array<{
      mint?: string
      symbol?: string
      bundles?: number
      bundled_buy_sol?: number
      bundled_sell_sol?: number
      events?: { launch?: number; buy?: number; sell?: number; call?: number }
    }>
  }>
}

type TokenChartBody = {
  chart?: {
    squad?: string
    mint?: string
    symbol?: string
    summary?: Record<string, unknown>
    markers?: Array<{ type?: string }>
  }
}

const cardCache = new Map<string, { expiresAt: number; png: Buffer }>()
const CARD_TTL_MS = 5 * 60 * 1000

export function resetSquadsShareCacheForTests(): void {
  cardCache.clear()
}

export function apiPublicUrl(): string {
  const u = (process.env.CREW_API_PUBLIC_URL || process.env.PUBLIC_API_URL || '').trim()
  if (u) return u.replace(/\/$/, '')
  return 'https://api.crewpay.dev'
}

export function squadsActivityPageUrl(opts: { siteUrl: string; squad: string; mint: string }): string {
  const origin = opts.siteUrl.replace(/\/$/, '')
  const qs = new URLSearchParams({ squad: opts.squad, mint: opts.mint })
  return `${origin}${SQUADS_ACTIVITY_PATH}?${qs.toString()}`
}

export function squadsActivityCardUrl(opts: { apiUrl: string; squad: string; mint: string }): string {
  const origin = opts.apiUrl.replace(/\/$/, '')
  const qs = new URLSearchParams({ squad: opts.squad, mint: opts.mint })
  return `${origin}${SQUADS_ACTIVITY_CARD_PATH}?${qs.toString()}`
}

export function buildSquadsActivityShareMeta(opts: {
  siteUrl: string
  apiUrl: string
  squad: string
  mint: string
  squadName?: string | null
  symbol?: string | null
}): SharePageMeta {
  const who = [opts.squadName?.trim(), opts.symbol?.trim()].filter(Boolean).join(' · ')
  const title = who ? `${who} · Squad activity · CrewPay` : 'Squad activity · CrewPay'
  const description = who
    ? `Public on-chain activity for ${who} on CrewPay. Statistical view only.`
    : 'Public on-chain squad activity on CrewPay. Statistical view only.'
  return {
    title,
    description,
    pageUrl: squadsActivityPageUrl(opts),
    imageUrl: squadsActivityCardUrl(opts),
  }
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function renderSquadsShareHtml(meta: SharePageMeta): string {
  const t = escapeAttr(meta.title)
  const d = escapeAttr(meta.description)
  const u = escapeAttr(meta.pageUrl)
  const img = escapeAttr(meta.imageUrl)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${t}</title>
  <meta name="description" content="${d}" />
  <link rel="canonical" href="${u}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:url" content="${u}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${img}" />
</head>
<body>
  <p><a href="${u}">Open Squad activity on CrewPay</a></p>
</body>
</html>`
}

export async function renderSquadsSharePageHtml(meta: SharePageMeta, siteOrigin: string): Promise<string> {
  const index = await loadSiteIndexHtml(siteOrigin)
  if (index) return injectSpaIndexMeta(index, meta)
  return renderSquadsShareHtml(meta)
}

function fontPath(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '../../assets/fonts/DejaVuSans.ttf'),
    join(here, '../../../assets/fonts/DejaVuSans.ttf'),
    join(here, '../../../../assets/fonts/DejaVuSans.ttf'),
  ]
  for (const p of candidates) {
    try {
      readFileSync(p)
      return p
    } catch {
      /* try next */
    }
  }
  throw new Error('Share card font not found')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderSquadsActivityCardSvg(opts: {
  squadName: string
  symbol: string
  bundles?: number | null
  bundledBuy?: number | null
  bundledSell?: number | null
}): string {
  const name = escapeXml(opts.squadName || 'Squad')
  const symbol = escapeXml(opts.symbol || 'Token')
  const bundles = opts.bundles != null && Number.isFinite(opts.bundles) ? String(opts.bundles) : '—'
  const buy =
    opts.bundledBuy != null && Number.isFinite(opts.bundledBuy) ? `${opts.bundledBuy.toFixed(1)} SOL` : '—'
  const sell =
    opts.bundledSell != null && Number.isFinite(opts.bundledSell) ? `${opts.bundledSell.toFixed(1)} SOL` : '—'
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0b0f17"/>
  <rect x="36" y="36" width="1128" height="558" rx="18" fill="none" stroke="#1a2230" stroke-width="2"/>
  <text x="72" y="130" fill="#d1d5db" font-size="28" font-family="DejaVu Sans, sans-serif">Squad activity</text>
  <text x="72" y="220" fill="#c8ff3d" font-size="56" font-family="DejaVu Sans, sans-serif">${name}</text>
  <text x="72" y="290" fill="#d1d5db" font-size="36" font-family="DejaVu Sans, sans-serif">${symbol}</text>
  <text x="72" y="390" fill="#9aa3b2" font-size="24" font-family="DejaVu Sans, sans-serif">Bundles ${bundles} · bundled buy ${buy} · bundled sell ${sell}</text>
  <text x="72" y="540" fill="#6b7280" font-size="22" font-family="DejaVu Sans, sans-serif">crewpay.dev · UTC</text>
</svg>`
}

async function lookupActivityLabel(
  squadId: string,
  mint: string,
): Promise<{ squadName: string; symbol: string; bundles?: number; bundledBuy?: number; bundledSell?: number }> {
  const origin = squadsUpstreamOrigin()
  if (!origin) return { squadName: squadId, symbol: mint.slice(0, 6) }
  const charts = await fetchSquadsUpstream('charts', chartsUpstreamUrl(origin))
  const tokenChart = await fetchSquadsUpstream(
    `token-chart:${squadId}:${mint}`,
    tokenChartUpstreamUrl(origin, squadId, mint),
  )
  const rows = charts.ok ? ((charts.body as ChartsBody).squads || []) : []
  const squad = rows.find((s) => s.id === squadId)
  const token = squad?.tokens?.find((t) => t.mint === mint)
  const chartSymbol = tokenChart.ok ? (tokenChart.body as TokenChartBody).chart?.symbol : null
  return {
    squadName: squad?.name || squadId,
    symbol: token?.symbol || chartSymbol || mint.slice(0, 6),
    bundles: token?.bundles,
    bundledBuy: token?.bundled_buy_sol,
    bundledSell: token?.bundled_sell_sol,
  }
}

export async function squadsActivityCardPng(squadId: string, mint: string): Promise<Buffer> {
  const key = `${squadId}:${mint}`
  const hit = cardCache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.png
  const label = await lookupActivityLabel(squadId, mint)
  const svg = renderSquadsActivityCardSvg({
    squadName: label.squadName,
    symbol: label.symbol,
    bundles: label.bundles,
    bundledBuy: label.bundledBuy,
    bundledSell: label.bundledSell,
  })
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: {
      fontFiles: [fontPath()],
      defaultFontFamily: 'DejaVu Sans',
      loadSystemFonts: false,
    },
  })
  const png = resvg.render().asPng()
  cardCache.set(key, { expiresAt: Date.now() + CARD_TTL_MS, png })
  return png
}

export async function sendSquadsActivitySharePage(
  res: Response,
  squadRaw: unknown,
  mintRaw: unknown,
): Promise<void> {
  const squad = validateSquadId(squadRaw)
  const mint = validateMint(mintRaw)
  if (!squad || !mint) {
    res.status(400).type('html').send('invalid squad or mint')
    return
  }
  const site = siteUrl()
  const label = await lookupActivityLabel(squad, mint)
  const meta = buildSquadsActivityShareMeta({
    siteUrl: site,
    apiUrl: apiPublicUrl(),
    squad,
    mint,
    squadName: label.squadName,
    symbol: label.symbol,
  })
  const html = await renderSquadsSharePageHtml(meta, site)
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'public, max-age=60')
  res.setHeader('cross-origin-resource-policy', 'cross-origin')
  res.send(html)
}
