#!/usr/bin/env node
/**
 * Fails the build if public bundles appear to contain secrets.
 * Checks:
 * - any 'crew_ak_' agent key
 * - 40+ hex run near 'x-crew-api-key'
 * - JWT-like 'eyJhbGci'
 * - 'api-key=' or suspicious 'api_key=' (allow 'api_key=FREE')
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOTS = [
  join(process.cwd(), 'render-site'),
  join(process.cwd(), 'dist'),
]

const TEXT_EXTS = new Set([
  '.js',
  '.css',
  '.html',
  '.map',
  '.txt',
  '.json',
  '.svg',
  '.xml',
])

function* walk(dir) {
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const ent of entries) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) {
      yield* walk(p)
    } else if (ent.isFile()) {
      yield p
    }
  }
}

function scanFile(path) {
  const ext = extname(path).toLowerCase()
  if (!TEXT_EXTS.has(ext)) return null
  let text = ''
  try {
    const buf = readFileSync(path)
    // Skip large binaries just in case
    if (buf.length > 2_000_000) return null
    text = buf.toString('utf8')
  } catch {
    return null
  }

  const problems = []
  if (text.includes('crew_ak_')) {
    problems.push("contains 'crew_ak_'")
  }
  const nearApiKeyHex = /x-crew-api-key[^]{0,120}([0-9a-fA-F]{40,})|([0-9a-fA-F]{40,})[^]{0,120}x-crew-api-key/gs
  if (nearApiKeyHex.test(text)) {
    problems.push('40+ hex near x-crew-api-key')
  }
  if (text.includes('eyJhbGci')) {
    problems.push("contains 'eyJhbGci' (JWT-like)")
  }
  // api-key= (dash) is always suspicious
  if (/api-key=/i.test(text)) {
    problems.push("contains 'api-key='")
  }
  // api_key= allowed only when exactly FREE
  const apiKeyMatches = text.match(/api_key=([A-Za-z0-9._-]+)/g) || []
  for (const m of apiKeyMatches) {
    if (!/api_key=FREE\b/.test(m)) problems.push(`contains '${m}'`)
  }

  return problems.length ? problems : null
}

function main() {
  const start = Date.now()
  const findings = []
  for (const root of ROOTS) {
    let s
    try {
      s = statSync(root)
    } catch {
      continue
    }
    if (!s.isDirectory()) continue
    for (const file of walk(root)) {
      const probs = scanFile(file)
      if (probs && probs.length) {
        findings.push({ file, probs })
      }
    }
  }
  if (findings.length) {
    console.error('Bundle secret check failed:')
    for (const f of findings) {
      console.error(`- ${f.file}: ${f.probs.join(', ')}`)
    }
    process.exit(1)
  }
  console.log(`Bundle secret check passed in ${Date.now() - start}ms`)
}

main()

