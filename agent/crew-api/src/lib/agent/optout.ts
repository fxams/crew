import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Autohire opt-out list. Handles listed here are never picked by Autohire,
 * including registered crew. It only affects future crew suggestions; it does not
 * touch fee-shares already locked on existing coins.
 *
 * Sources (merged):
 *  - data/autohire-optout.json: [{ "handle": "@someone", "reason": "asked to opt out", "at": "2026-10-12" }]
 *  - AUTOHIRE_EXCLUDE_HANDLES env (comma/space separated), optional.
 */
export type OptOutEntry = { handle: string; reason?: string; at?: string; /** House/operator account: also hidden from public leaderboards. */ house?: boolean }

export function normalizeHandle(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '')
    .replace(/^@+/, '')
    .toLowerCase()
}

function loadFile(): OptOutEntry[] {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(process.cwd(), 'data/autohire-optout.json'),
    join(here, '../../../data/autohire-optout.json'),
    join(here, '../../../../data/autohire-optout.json'),
  ]
  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'))
      return Array.isArray(parsed) ? (parsed as OptOutEntry[]) : []
    } catch {
      /* try next */
    }
  }
  return []
}

export function buildOptOutSet(
  entries: OptOutEntry[] = loadFile(),
  envValue: string | undefined = process.env.AUTOHIRE_EXCLUDE_HANDLES,
): Set<string> {
  const out = new Set<string>()
  for (const e of entries) {
    const h = normalizeHandle(e?.handle || '')
    if (h) out.add(h)
  }
  for (const part of String(envValue || '').split(/[\s,]+/)) {
    const h = normalizeHandle(part)
    if (h) out.add(h)
  }
  return out
}

let cached: Set<string> | null = null
export function autohireOptOuts(): Set<string> {
  if (!cached) cached = buildOptOutSet()
  return cached
}

/** True when any of the given handles is on the opt-out list. */
export function isOptedOut(handles: Array<string | undefined | null>, set = autohireOptOuts()): boolean {
  if (!set.size) return false
  return handles.some((h) => h && set.has(normalizeHandle(h)))
}

/** House accounts (entries with house: true) are also hidden from public leaderboards/counters. */
export function buildHouseSet(entries: OptOutEntry[] = loadFile()): Set<string> {
  const out = new Set<string>()
  for (const e of entries) {
    if (!e?.house) continue
    const h = normalizeHandle(e.handle || '')
    if (h) out.add(h)
  }
  return out
}

let houseCached: Set<string> | null = null
export function houseHandles(): Set<string> {
  if (!houseCached) houseCached = buildHouseSet()
  return houseCached
}

export function isHouseHandle(handle: string | undefined | null, set = houseHandles()): boolean {
  return Boolean(handle) && set.has(normalizeHandle(String(handle)))
}
