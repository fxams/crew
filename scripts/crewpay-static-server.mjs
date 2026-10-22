/**
 * Production static host for crewpay.dev — serves Vite dist with injected OG meta
 * on /kol/:handle and /ref/:handle (crawlers do not run JS).
 */
import { createServer } from 'node:http'
import { readFileSync, statSync, createReadStream } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const dist = join(root, 'dist')
const indexPath = join(dist, 'index.html')
const indexTemplate = readFileSync(indexPath, 'utf8')

const SITE = (process.env.VITE_SITE_URL || 'https://crewpay.dev').replace(/\/$/, '')
const API = (process.env.VITE_CREW_API_URL || 'https://api.crewpay.dev').replace(/\/$/, '')
const PORT = Number(process.env.PORT || 10000)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
}

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

async function fetchShareMeta(handle, kind) {
  const clean = handle.replace(/^@+/, '').trim()
  const pageUrl = kind === 'ref' ? `${SITE}/ref/${encodeURIComponent(clean)}` : `${SITE}/kol/${encodeURIComponent(clean)}`
  const imageUrl = `${API}/api/kol-program/card/${encodeURIComponent(clean)}.png`
  let card = null
  try {
    const res = await fetch(`${API}/api/kol-program/public/${encodeURIComponent(clean)}`)
    if (res.ok) card = (await res.json()).card
  } catch {
    /* fallback meta */
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

function matchKolRef(pathname) {
  const m = pathname.match(/^\/(kol|ref)\/([A-Za-z0-9_]{1,15})$/)
  if (!m) return null
  return { kind: m[1] === 'ref' ? 'ref' : 'kol', handle: m[2] }
}

function safePath(urlPath) {
  const p = decodeURIComponent(urlPath.split('?')[0])
  if (p.includes('..')) return null
  return p
}

function serveFile(res, filePath) {
  const ext = extname(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  createReadStream(filePath).pipe(res)
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = safePath(req.url || '/')
    if (!urlPath) {
      res.writeHead(400)
      res.end('Bad path')
      return
    }

    const kolRef = matchKolRef(urlPath)
    if (kolRef) {
      const meta = await fetchShareMeta(kolRef.handle, kolRef.kind)
      const html = injectMeta(indexTemplate, meta)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
      res.end(html)
      return
    }

    const filePath = join(dist, urlPath === '/' ? 'index.html' : urlPath)
    try {
      const st = statSync(filePath)
      if (st.isFile()) {
        serveFile(res, filePath)
        return
      }
    } catch {
      /* spa fallback */
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(indexTemplate)
  } catch (err) {
    console.error('crewpay-static-server', err)
    res.writeHead(500)
    res.end('Server error')
  }
})

server.listen(PORT, () => {
  console.log(`crewpay static+og server on :${PORT} dist=${dist}`)
})
