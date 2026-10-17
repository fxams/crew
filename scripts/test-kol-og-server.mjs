/**
 * Smoke test: crewpay-static-server injects API card PNG into og:image for any handle.
 * Requires `npm run build` first (dist/index.html).
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 18_765
const HANDLE = '0x4dY'
const EXPECT_IMG = `https://api.crewpay.dev/api/kol-program/card/${encodeURIComponent(HANDLE)}.png`

const child = spawn(process.execPath, ['scripts/crewpay-static-server.mjs'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let failed = false
function fail(msg) {
  console.error(`test-kol-og-server: ${msg}`)
  failed = true
}

child.stderr.on('data', (d) => process.stderr.write(d))

await sleep(800)

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
  }
} catch (err) {
  fail(String(err))
} finally {
  child.kill('SIGTERM')
  await sleep(200)
}

if (failed) process.exit(1)
console.log('test-kol-og-server: ok')
