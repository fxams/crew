/**
 * Write dist/kol/:handle.html and dist/ref/:handle.html with OG meta
 * so Render static (real files before SPA rewrite) serves crawler tags without JS.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const targets = ['dist', 'render-site'].map((d) => join(root, d))
const indexTemplate = readFileSync(join(root, 'dist', 'index.html'), 'utf8')

const SITE = (process.env.VITE_SITE_URL || 'https://crewpay.dev').replace(/\/$/, '')
const API = (process.env.VITE_CREW_API_URL || 'https://api.crewpay.dev').replace(/\/$/, '')

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function injectMeta(indexHtml, meta) {
  const t = escapeAttr(meta.title)
  const d = escapeAttr(meta.description)
  const u = escapeAttr(meta.pageUrl)
  const img = escapeAttr(meta.imageUrl)
  let h = indexHtml
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`)
  h = h.replace(/<meta name="description"[\s\S]*?\/>/, `<meta name="description" content="${d}" />`)
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

async function metaFor(handle, kind) {
  const clean = handle.replace(/^@+/, '').trim()
  const pageUrl =
    kind === 'ref'
      ? `${SITE}/ref/${encodeURIComponent(clean)}`
      : `${SITE}/kol/${encodeURIComponent(clean)}`
  const imageUrl = `${API}/api/kol-program/card/${encodeURIComponent(clean)}.png`
  let card = null
  try {
    const res = await fetch(`${API}/api/kol-program/public/${encodeURIComponent(clean)}`)
    if (res.ok) card = (await res.json()).card
  } catch {
    /* fallback */
  }
  const title = `@${clean} · CrewPay KOL`
  const reach = card?.reachScore ?? 0
  const tier = card?.tier ?? 'bronze'
  const disclaimer =
    'Points have no cash value. The season pool is variable and not guaranteed.'
  const description = card?.unclaimed
    ? `@${clean} on CrewPay — reach ${reach} (${tier}). Claim your KOL card. ${disclaimer}`
    : `@${clean} — CrewPay KOL · reach ${reach} (${tier}). ${disclaimer}`
  return { title, description, pageUrl, imageUrl }
}

function kolDbHandles() {
  const paths = [
    join(root, 'agent/crew-api/data/kol-db.json'),
    join(root, 'agent/crew/src/lib/pump/kol-db.json'),
  ]
  for (const p of paths) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'))
      const list = Array.isArray(raw) ? raw : raw.kols || raw.rows || []
      const handles = list
        .map((r) => String(r.xUsername || r.handle || r.username || '').replace(/^@+/, ''))
        .filter((h) => /^[A-Za-z0-9_]{1,15}$/.test(h))
      if (handles.length) return [...new Set(handles)]
    } catch {
      /* try next */
    }
  }
  return []
}

function extraHandles() {
  const raw = (process.env.KOL_OG_PRERENDER_HANDLES || 'VitalikButerin,CrewPayHQ').trim()
  return raw
    .split(/[,\s]+/)
    .map((h) => h.replace(/^@+/, ''))
    .filter((h) => /^[A-Za-z0-9_]{1,15}$/.test(h))
}

async function writePage(relDir, handle, kind) {
  const meta = await metaFor(handle, kind)
  const html = injectMeta(indexTemplate, meta)
  const dir = join(dist, relDir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${handle}.html`), html)
}

const handles = [...new Set([...kolDbHandles(), ...extraHandles()])]
let ok = 0
for (const h of handles) {
  await writePage('kol', h, 'kol')
  await writePage('ref', h, 'ref')
  ok++
}
console.log(`prerender-kol-og: wrote kol+ref OG pages for ${ok} handles`)
