/**
 * CREW KOL database — Pump-verified wallets with rank, narrative tags,
 * and correlation packs for automated hire during launch.
 *
 * Wallet = canonical_svm_wallet from Pump /users API (fee-share identity).
 * Rank = Pump follower order (1 = most followed in this set).
 */

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
  /** Stable id (= pump username lowercased) */
  id: string
  /** 1 = highest followers in this DB */
  rank: number
  pump: string
  x: string | null
  followers: number
  wallet: string
  aliases?: string[]
  /** Narratives this KOL fits */
  narratives: NarrativeTag[]
  /** Correlated pump handles (often hired together) */
  correlated: string[]
  /** Preferred hire roles when Agent mode is on */
  roles: KolRoleHint[]
}

/** Flat shape used by wallet resolve */
export type KolDirectoryEntry = {
  pump: string
  x: string | null
  followers: number
  wallet: string
  aliases?: string[]
}

export const KOL_DB: KolRecord[] = [
  {
    id: 'slingoor',
    rank: 1,
    pump: 'slingoor',
    x: 'slingoorio',
    followers: 184_688,
    wallet: '5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij',
    aliases: ['slingoorio'],
    narratives: ['trench', 'degen', 'meme', 'culture'],
    correlated: ['cupsey', 'cooker', 'daumen'],
    roles: ['caller', 'kol'],
  },
  {
    id: 'cooker',
    rank: 2,
    pump: 'cooker',
    x: 'CookerFlips',
    followers: 148_772,
    wallet: '8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6',
    aliases: ['cookerflips'],
    narratives: ['trench', 'degen', 'meme'],
    correlated: ['slingoor', 'cupsey', 'smokez'],
    roles: ['caller', 'kol'],
  },
  {
    id: 'cupsey',
    rank: 3,
    pump: 'cupsey',
    x: 'Cupseyy',
    followers: 136_053,
    wallet: '6DQAGJT7VZPVBsuG4kn3AvpyHCEi7B2RFFvMZdbqQqqP',
    aliases: ['cupseyy'],
    narratives: ['trench', 'degen', 'raid', 'meme'],
    correlated: ['slingoor', 'cooker', 'limfork'],
    roles: ['caller', 'raid'],
  },
  {
    id: 'daumen',
    rank: 4,
    pump: 'daumen',
    x: 'daumenxyz',
    followers: 134_811,
    wallet: '8MaVa9kdt3NW4Q5HyNAm1X5LbR8PQRVDc1W8NMVK88D5',
    aliases: ['daumenxyz'],
    narratives: ['trench', 'degen', 'culture'],
    correlated: ['slingoor', 'limfork', 'trunoest'],
    roles: ['chart', 'kol'],
  },
  {
    id: 'limfork',
    rank: 5,
    pump: 'limfork',
    x: 'Limfork',
    followers: 102_509,
    wallet: 'BQVz7fQ1WsQmSTMY3umdPEPPTm1sdcBcX9sP7o6kPRmB',
    narratives: ['trench', 'degen', 'meme'],
    correlated: ['cupsey', 'daumen', 'smokez'],
    roles: ['caller', 'kol'],
  },
  {
    id: 'smokez',
    rank: 6,
    pump: 'Smokez',
    x: 'SmokezXBT',
    followers: 87_382,
    wallet: '5t9xBNuDdGTGpjaPTx6hKd7sdRJbvtKS8Mhq6qVbo8Qz',
    aliases: ['smokezxbt', 'smokez'],
    narratives: ['trench', 'degen', 'raid'],
    correlated: ['cooker', 'limfork', 'gake'],
    roles: ['raid', 'kol'],
  },
  {
    id: 'trunoest',
    rank: 7,
    pump: 'trunoest',
    x: 'trunoest',
    followers: 34_312,
    wallet: 'ardinRsN1mNYVeoJWTBsWeYeXvuR9UUDGMsCDKpb6AT',
    narratives: ['trench', 'degen', 'meme'],
    correlated: ['daumen', 'leck', 'gake'],
    roles: ['caller', 'chart'],
  },
  {
    id: '0xwinged',
    rank: 8,
    pump: '0xwinged',
    x: null,
    followers: 28_498,
    wallet: 'HrCPnDvDgbpbFxKxer6Pw3qEcfAQQNNjb6aJNFWgTEng',
    narratives: ['ai', 'culture', 'general'],
    correlated: ['leck', 'gake'],
    roles: ['dev', 'kol'],
  },
  {
    id: 'leck',
    rank: 9,
    pump: 'Leck',
    x: 'LeckSol',
    followers: 3_260,
    wallet: '98T65wcMEjoNLDTJszBHGZEX75QRe8QaANXokv4yw3Mp',
    aliases: ['lecksol', 'leck'],
    narratives: ['trench', 'meme', 'animal'],
    correlated: ['trunoest', 'gake', '0xwinged'],
    roles: ['chart', 'kol'],
  },
  {
    id: 'gake',
    rank: 10,
    pump: 'gake',
    x: 'Ga__ke',
    followers: 1_169,
    wallet: 'C5FuhpiezHH6b1bR7eSF5fT4dNsEMzwNcEVvpKggXJq1',
    aliases: ['ga__ke'],
    narratives: ['meme', 'animal', 'culture', 'raid'],
    correlated: ['smokez', 'leck', 'trunoest'],
    roles: ['raid', 'kol'],
  },
]

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
  // Soft: shared narrative overlap
  const shared = left.narratives.filter((t) => right.narratives.includes(t)).length
  if (!shared) return 0
  return Math.min(0.45, shared * 0.15)
}
