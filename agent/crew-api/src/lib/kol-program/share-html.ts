import { KOL_PROGRAM_POINTS_DISCLAIMER } from './copy.js'
import type { PublicKolCard } from './public-card.js'

export type SharePageMeta = {
  title: string
  description: string
  pageUrl: string
  imageUrl: string
}

export function buildSharePageMeta(opts: {
  handle: string
  kind: 'kol' | 'ref'
  siteUrl: string
  apiUrl: string
  card: PublicKolCard | null
}): SharePageMeta {
  const clean = opts.handle.replace(/^@+/, '')
  const pagePath = opts.kind === 'ref' ? `/ref/${encodeURIComponent(clean)}` : `/kol/${encodeURIComponent(clean)}`
  const pageUrl = `${opts.siteUrl.replace(/\/$/, '')}${pagePath}`
  const imageUrl = `${opts.apiUrl.replace(/\/$/, '')}/api/kol-program/card/${encodeURIComponent(clean)}.png`
  const title = `@${clean} · CrewPay KOL`
  const reach = opts.card?.reachScore ?? 0
  const tier = opts.card?.tier ?? 'bronze'
  const description = opts.card?.unclaimed
    ? `@${clean} on CrewPay — estimated reach ${reach} (${tier}). Claim your KOL card. ${KOL_PROGRAM_POINTS_DISCLAIMER}`
    : `@${clean} — CrewPay KOL · reach ${reach} (${tier}). ${KOL_PROGRAM_POINTS_DISCLAIMER}`
  return { title, description, pageUrl, imageUrl }
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Minimal HTML for crawlers (Twitterbot, etc.) — no JS required. */
export function renderShareHtml(meta: SharePageMeta): string {
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
  <p><a href="${u}">Open CrewPay KOL — @${escapeAttr(meta.pageUrl.split('/').pop() || '')}</a></p>
</body>
</html>`
}

function stripMeta(html: string, attr: 'name' | 'property', key: string): string {
  // One tag only — never span from an earlier <meta charset> across <title>.
  const re = new RegExp(`<meta\\b[^>]*?\\b${attr}="${key}"[^>]*?\\/>`, 'i')
  return html.replace(re, '')
}

/** Inject OG tags into the built SPA index.html shell (humans + crawlers on crewpay.dev). */
export function injectSpaIndexMeta(indexHtml: string, meta: SharePageMeta): string {
  const t = escapeAttr(meta.title)
  const d = escapeAttr(meta.description)
  const u = escapeAttr(meta.pageUrl)
  const img = escapeAttr(meta.imageUrl)
  let h = indexHtml
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`)
  for (const [attr, key] of [
    ['name', 'description'],
    ['property', 'og:title'],
    ['property', 'og:description'],
    ['property', 'og:url'],
    ['property', 'og:image'],
    ['property', 'og:image:width'],
    ['property', 'og:image:height'],
    ['property', 'og:image:type'],
    ['name', 'twitter:title'],
    ['name', 'twitter:description'],
    ['name', 'twitter:image'],
    ['name', 'twitter:card'],
  ] as const) {
    h = stripMeta(h, attr, key)
  }
  const block = `    <meta name="description" content="${d}" />
    <link rel="canonical" href="${u}" />
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
    <meta name="twitter:image" content="${img}" />`
  if (/<\/title>/i.test(h)) {
    h = h.replace(/<\/title>/i, `</title>\n${block}`)
  } else {
    h = h.replace(/<head[^>]*>/i, (open) => `${open}\n    <title>${t}</title>\n${block}`)
  }
  return h
}

const SITE_INDEX_TTL_MS = 60_000
let siteIndexCache: { html: string; at: number } | null = null

export function resetSiteIndexCacheForTests(): void {
  siteIndexCache = null
}

/** Live SPA shell from crewpay.dev — relative /assets stay valid when Render rewrites /kol/* here. */
export async function loadSiteIndexHtml(siteOrigin: string): Promise<string | null> {
  const now = Date.now()
  if (siteIndexCache && now - siteIndexCache.at < SITE_INDEX_TTL_MS) return siteIndexCache.html
  const origin = siteOrigin.replace(/\/$/, '')
  try {
    const res = await fetch(`${origin}/`, {
      headers: { Accept: 'text/html', 'User-Agent': 'CrewPayShareBot/1' },
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return siteIndexCache?.html ?? null
    const html = await res.text()
    if (!html.includes('id="root"')) return siteIndexCache?.html ?? null
    siteIndexCache = { html, at: now }
    return html
  } catch {
    return siteIndexCache?.html ?? null
  }
}

export async function renderKolSharePageHtml(meta: SharePageMeta, siteOrigin: string): Promise<string> {
  const index = await loadSiteIndexHtml(siteOrigin)
  if (index) return injectSpaIndexMeta(index, meta)
  return renderShareHtml(meta)
}
