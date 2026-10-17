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

/** Inject OG tags into the built SPA index.html shell (humans + crawlers on crewpay.dev). */
export function injectSpaIndexMeta(indexHtml: string, meta: SharePageMeta): string {
  const t = escapeAttr(meta.title)
  const d = escapeAttr(meta.description)
  const u = escapeAttr(meta.pageUrl)
  const img = escapeAttr(meta.imageUrl)
  let h = indexHtml
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`)
  h = h.replace(
    /<meta name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${d}" />`,
  )
  h = h.replace(/<meta property="og:title"[\s\S]*?\/>/m, `<meta property="og:title" content="${t}" />`)
  h = h.replace(
    /<meta property="og:description"[\s\S]*?\/>/m,
    `<meta property="og:description" content="${d}" />`,
  )
  h = h.replace(/<meta property="og:url"[\s\S]*?\/>/m, `<meta property="og:url" content="${u}" />`)
  h = h.replace(
    /<meta property="og:image"[\s\S]*?\/>/m,
    `<meta property="og:image" content="${img}" />\n    <meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />\n    <meta property="og:image:type" content="image/png" />`,
  )
  h = h.replace(/<meta name="twitter:title"[\s\S]*?\/>/m, `<meta name="twitter:title" content="${t}" />`)
  h = h.replace(
    /<meta name="twitter:description"[\s\S]*?\/>/m,
    `<meta name="twitter:description" content="${d}" />`,
  )
  h = h.replace(/<meta name="twitter:image"[\s\S]*?\/>/m, `<meta name="twitter:image" content="${img}" />`)
  h = h.replace(
    /<meta name="twitter:card"[\s\S]*?\/>/m,
    `<meta name="twitter:card" content="summary_large_image" />`,
  )
  return h
}
