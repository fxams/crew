/**
 * Curated Pump.fun profiles with verified wallets (from Pump /users API).
 * Used as a fast/offline path when CORS proxies flake, and to map X aliases
 * (e.g. @slingoorio → Pump @slingoor).
 *
 * Ranked roughly by Pump follower count at last refresh.
 * Wallet = canonical_svm_wallet from Pump — the fee-share identity, not every
 * trading wallet a KOL may use elsewhere.
 */
export type KolDirectoryEntry = {
  /** Pump username (path on pump.fun/profile/…) */
  pump: string
  /** Linked X handle when Pump exposes x_username */
  x: string | null
  followers: number
  wallet: string
  /** Extra aliases that should resolve to this wallet */
  aliases?: string[]
}

export const KOL_DIRECTORY: KolDirectoryEntry[] = [
  {
    pump: 'slingoor',
    x: 'slingoorio',
    followers: 184_688,
    wallet: '5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij',
    aliases: ['slingoorio'],
  },
  {
    pump: 'cooker',
    x: 'CookerFlips',
    followers: 148_772,
    wallet: '8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6',
    aliases: ['cookerflips'],
  },
  {
    pump: 'cupsey',
    x: 'Cupseyy',
    followers: 136_053,
    wallet: '6DQAGJT7VZPVBsuG4kn3AvpyHCEi7B2RFFvMZdbqQqqP',
    aliases: ['cupseyy'],
  },
  {
    pump: 'daumen',
    x: 'daumenxyz',
    followers: 134_811,
    wallet: '8MaVa9kdt3NW4Q5HyNAm1X5LbR8PQRVDc1W8NMVK88D5',
    aliases: ['daumenxyz'],
  },
  {
    pump: 'limfork',
    x: 'Limfork',
    followers: 102_509,
    wallet: 'BQVz7fQ1WsQmSTMY3umdPEPPTm1sdcBcX9sP7o6kPRmB',
  },
  {
    pump: 'Smokez',
    x: 'SmokezXBT',
    followers: 87_382,
    wallet: '5t9xBNuDdGTGpjaPTx6hKd7sdRJbvtKS8Mhq6qVbo8Qz',
    aliases: ['smokezxbt', 'smokez'],
  },
  {
    pump: 'trunoest',
    x: 'trunoest',
    followers: 34_312,
    wallet: 'ardinRsN1mNYVeoJWTBsWeYeXvuR9UUDGMsCDKpb6AT',
  },
  {
    pump: '0xwinged',
    x: null,
    followers: 28_498,
    wallet: 'HrCPnDvDgbpbFxKxer6Pw3qEcfAQQNNjb6aJNFWgTEng',
  },
  {
    pump: 'Leck',
    x: 'LeckSol',
    followers: 3_260,
    wallet: '98T65wcMEjoNLDTJszBHGZEX75QRe8QaANXokv4yw3Mp',
    aliases: ['lecksol', 'leck'],
  },
  {
    pump: 'gake',
    x: 'Ga__ke',
    followers: 1_169,
    wallet: 'C5FuhpiezHH6b1bR7eSF5fT4dNsEMzwNcEVvpKggXJq1',
    aliases: ['ga__ke'],
  },
]

function norm(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase()
}

const INDEX = (() => {
  const map = new Map<string, KolDirectoryEntry>()
  for (const row of KOL_DIRECTORY) {
    map.set(norm(row.pump), row)
    if (row.x) map.set(norm(row.x), row)
    for (const a of row.aliases || []) map.set(norm(a), row)
  }
  return map
})()

/** Top N directory rows by followers (default 10). */
export function topKolDirectory(limit = 10): KolDirectoryEntry[] {
  return [...KOL_DIRECTORY].sort((a, b) => b.followers - a.followers).slice(0, limit)
}

/** Instant lookup by Pump username, X handle, or alias. */
export function lookupKolDirectory(rawHandle: string): KolDirectoryEntry | null {
  const key = norm(rawHandle)
  if (!key) return null
  return INDEX.get(key) ?? null
}
