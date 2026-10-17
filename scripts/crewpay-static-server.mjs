/**
 * Production static host for crewpay.dev — serves Vite dist with injected OG meta
 * on /kol/:handle and /ref/:handle (crawlers do not run JS).
 *
 * Reserved /kol/<word> product routes (tasks, leaderboard, …) stay on the SPA
 * shell so they are never treated as X handles.
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
const HOST = process.env.HOST || '0.0.0.0'

/** Keep in sync with agent/crew-api/src/lib/kol-program/reserved-paths.ts */
const KOL_RESERVED_PATH_WORDS = new Set([
  'tasks',
  'leaderboard',
  'founders',
  'alerts',
  'battles',
  'me',
  'hub',
  'card',
  'settings',
  'register',
  'login',
  'logout',
  'signin',
  'signup',
  'auth',
  'oauth',
  'callback',
  'admin',
  'api',
  'home',
  'board',
  'desk',
  'profile',
  'notifications',
  'notifs',
  'share',
  'download',
  'wallet',
  'payout',
  'onboarding',
  'today',
  'verify',
  'claim',
  'referrals',
  'referral',
  'invite',
  'season',
  'pool',
  'program',
  'index',
  'status',
  'help',
  'support',
  'about',
])

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-src 'self' https://verify.walletconnect.org https://verify.walletconnect.com https://secure.walletconnect.com https://secure.walletconnect.org; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

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

function isKolReservedPathWord(word) {
  const w = String(word || '')
    .replace(/^@+/, '')
    .trim()
    .toLowerCase()
  return KOL_RESERVED_PATH_WORDS.has(w)
}

function stripMeta(html, attr, key) {
  // One tag only — never span from an earlier <meta charset> across <title>.
  const re = new RegExp(`<meta\\b[^>]*?\\b${attr}="${key}"[^>]*?\\/>`, 'i')
  return html.replace(re, '')
}

/** Strip-then-insert, matching API injectSpaIndexMeta so multiline index tags stay intact. */
function injectMeta(indexHtml, meta) {
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
  ]) {
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
  const kind = m[1] === 'ref' ? 'ref' : 'kol'
  const handle = m[2]
  if (kind === 'kol' && isKolReservedPathWord(handle)) return null
  return { kind, handle }
}

function safePath(urlPath) {
  const p = decodeURIComponent(urlPath.split('?')[0])
  if (p.includes('..')) return null
  return p
}

function writeHead(res, status, extra = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...extra })
}

function serveFile(res, filePath) {
  const ext = extname(filePath)
  const extra = { 'Content-Type': MIME[ext] || 'application/octet-stream' }
  if (ext === '.html') extra['Cache-Control'] = 'no-cache, no-store, must-revalidate'
  writeHead(res, 200, extra)
  createReadStream(filePath).pipe(res)
}

function serveSpa(res) {
  writeHead(res, 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  })
  res.end(indexTemplate)
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = safePath(req.url || '/')
    if (!urlPath) {
      writeHead(res, 400)
      res.end('Bad path')
      return
    }

    const kolRef = matchKolRef(urlPath)
    if (kolRef) {
      const meta = await fetchShareMeta(kolRef.handle, kolRef.kind)
      const html = injectMeta(indexTemplate, meta)
      writeHead(res, 200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      })
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

    serveSpa(res)
  } catch (err) {
    console.error('crewpay-static-server', err)
    writeHead(res, 500)
    res.end('Server error')
  }
})

server.listen(PORT, HOST, () => {
  console.log(`crewpay static+og server on ${HOST}:${PORT} dist=${dist}`)
})
