/**
 * Smoke test: crewpay-static-server injects API card PNG into og:image for any handle.
 * Reserved /kol product routes stay on the default SPA shell.
 * Requires `npm run build` first (dist/index.html).
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 18_765
const HANDLE = '0x4dY'
const EXPECT_IMG = `https://api.crewpay.dev/api/kol-program/card/${encodeURIComponent(HANDLE)}.png`
const RESERVED_PATHS = ['/kol/tasks', '/kol/leaderboard', '/kol/founders', '/kol/alerts']

const child = spawn(process.execPath, ['scripts/crewpay-static-server.mjs'], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let failed = false
function fail(msg) {
  console.error(`test-kol-og-server: ${msg}`)
  failed = true
}

child.stderr.on('data', (d) => process.stderr.write(d))
child.stdout.on('data', (d) => process.stdout.write(d))

let started = false
for (let i = 0; i < 40; i++) {
  await sleep(100)
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(200) })
    if (res.ok) {
      started = true
      break
    }
  } catch {
    /* still booting */
  }
  if (child.exitCode != null) {
    fail(`server exited ${child.exitCode}`)
    break
  }
}
if (!started && !failed) fail('server start timeout')

try {
  for (const path of [`/kol/${HANDLE}`, `/ref/${HANDLE}`]) {
    const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
      headers: { 'User-Agent': 'Twitterbot/1.0' },
    })
    if (!res.ok) {
      fail(`${path} HTTP ${res.status}`)
      continue
    }
    const html = await res.text()
    if (!html.includes(`property="og:image" content="${EXPECT_IMG}"`)) {
      fail(`${path} missing og:image ${EXPECT_IMG}`)
    }
    if (!html.includes('summary_large_image')) {
      fail(`${path} missing twitter:card summary_large_image`)
    }
    if (!html.includes(`<title>@${HANDLE} · CrewPay KOL</title>`)) {
      fail(`${path} missing per-handle title`)
    }
    if (!html.includes('id="root"')) {
      fail(`${path} lost SPA root`)
    }
  }

  for (const path of RESERVED_PATHS) {
    const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
      headers: { 'User-Agent': 'Twitterbot/1.0' },
    })
    if (!res.ok) {
      fail(`${path} HTTP ${res.status}`)
      continue
    }
    const html = await res.text()
    if (html.includes('/api/kol-program/card/')) {
      fail(`${path} treated reserved word as handle OG`)
    }
    if (!html.includes('id="root"')) {
      fail(`${path} missing SPA root`)
    }
    if (!html.includes('banner-og.jpg')) {
      fail(`${path} missing default site OG image`)
    }
  }
} catch (err) {
  fail(String(err))
} finally {
  child.kill('SIGTERM')
  await sleep(200)
}

if (failed) process.exit(1)
console.log('test-kol-og-server: ok')
