/**
 * CREW KOL database — 1500 Pump-verified wallets with rank, narrative tags,
 * and correlation packs for automated hire + handle→wallet autofill.
 *
 * Data: `kol-db.json` harvested from Pump `/users?sort=followers`.
 * Wallet = canonical_svm_wallet / address from Pump (fee-share identity).
 */

import rawDb from './kol-db.json'

export type NarrativeTag =
  | 'meme'
  | 'animal'
  | 'ai'
  | 'trench'
  | 'degen'
  | 'politics'
  | 'gaming'
  | 'culture'
  | 'raid'
  | 'general'

export type KolRoleHint = 'caller' | 'chart' | 'raid' | 'kol' | 'dev'

export type KolRecord = {
  id: string
  rank: number
  pump: string
  x: string | null
  followers: number
  wallet: string
  aliases?: string[]
  narratives: NarrativeTag[]
  correlated: string[]
  roles: KolRoleHint[]
}

export type KolDirectoryEntry = {
  pump: string
  x: string | null
  followers: number
  wallet: string
  aliases?: string[]
}

export const KOL_DB: KolRecord[] = rawDb as KolRecord[]

/** Flat export for wallet resolve */
export const KOL_DIRECTORY: KolDirectoryEntry[] = KOL_DB.map((r) => ({
  pump: r.pump,
  x: r.x,
  followers: r.followers,
  wallet: r.wallet,
  aliases: r.aliases,
}))

function norm(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase()
}

const INDEX = (() => {
  const map = new Map<string, KolRecord>()
  for (const row of KOL_DB) {
    map.set(norm(row.pump), row)
    map.set(row.id, row)
    if (row.x) map.set(norm(row.x), row)
    for (const a of row.aliases || []) map.set(norm(a), row)
  }
  return map
})()

export function getKolById(id: string): KolRecord | null {
  return INDEX.get(norm(id)) ?? null
}

export function kolDbSize(): number {
  return KOL_DB.length
}

/** Top N by rank (followers). */
export function topKolDirectory(limit = 10): KolDirectoryEntry[] {
  return [...KOL_DB]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((r) => ({
      pump: r.pump,
      x: r.x,
      followers: r.followers,
      wallet: r.wallet,
      aliases: r.aliases,
    }))
}

export function topKolRecords(limit = 10): KolRecord[] {
  return [...KOL_DB].sort((a, b) => a.rank - b.rank).slice(0, limit)
}

/** Instant lookup by Pump username, X handle, or alias. */
export function lookupKolDirectory(rawHandle: string): KolDirectoryEntry | null {
  const row = INDEX.get(norm(rawHandle))
  if (!row) return null
  return {
    pump: row.pump,
    x: row.x,
    followers: row.followers,
    wallet: row.wallet,
    aliases: row.aliases,
  }
}

export function lookupKolRecord(rawHandle: string): KolRecord | null {
  return INDEX.get(norm(rawHandle)) ?? null
}

/** Correlation strength 0–1 between two KOLs (symmetric pack edges). */
export function correlationScore(a: string, b: string): number {
  const left = INDEX.get(norm(a))
  const right = INDEX.get(norm(b))
  if (!left || !right || left.id === right.id) return 0
  const ab = left.correlated.some((c) => norm(c) === right.id)
  const ba = right.correlated.some((c) => norm(c) === left.id)
  if (ab && ba) return 1
  if (ab || ba) return 0.7
  const shared = left.narratives.filter((t) => right.narratives.includes(t)).length
  if (!shared) return 0
  return Math.min(0.45, shared * 0.15)
}
