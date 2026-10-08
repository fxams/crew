import { apiConfigured, fetchBoard, pushCoin, pushRemits, type BoardWallet } from './api'
import { DRAFT_KEY, STORE_KEY, STORE_LEGACY_KEYS, UI_KEY } from './config'
import { sanitizeBoard, sanitizeDraft, sanitizeUiPrefs } from './security'
import type { CoinRecord, LaunchDraft, RemitRecord } from './types'
import { seedCoins, seedRemits } from './seed'

/** Optional Phantom wallet for signed board writes (API key OR wallet sig). */
let boardWallet: BoardWallet | null = null

export function setBoardWallet(wallet: BoardWallet | null) {
  boardWallet = wallet
}

function syncCoinRemote(coin: CoinRecord) {
  if (!apiConfigured()) return
  void pushCoin(coin, { wallet: boardWallet }).catch((err) =>
    console.warn('API coin sync failed', err),
  )
}

function syncRemitsRemote(remits: RemitRecord[]) {
  if (!apiConfigured() || !remits.length) return
  void pushRemits(remits).catch((err) => console.warn('API remit sync failed', err))
}

export type Board = {
  coins: CoinRecord[]
  remits: RemitRecord[]
}

export type UiPrefs = {
  selectedMint?: string
}

function emptyBoard(): Board {
  const coins = seedCoins()
  return { coins, remits: seedRemits(coins) }
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (err) {
    // QuotaExceeded or private-mode blocks — keep app usable
    console.warn('localStorage write failed', key, err)
    return false
  }
}

function removeRaw(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Pull first non-empty legacy board blob, if any. */
function readLegacyBoardRaw(): string | null {
  for (const key of STORE_LEGACY_KEYS) {
    const raw = readRaw(key)
    if (raw) return raw
  }
  return null
}

export function loadBoard(): Board {
  try {
    let raw = readRaw(STORE_KEY)
    let fromLegacy = false
    if (!raw) {
      raw = readLegacyBoardRaw()
      fromLegacy = Boolean(raw)
    }
    if (!raw) {
      const seeded = emptyBoard()
      saveBoard(seeded)
      return seeded
    }
    const parsed = JSON.parse(raw) as unknown
    const clean = sanitizeBoard(parsed)
    // Heal + migrate: always persist sanitized shape under current key
    writeRaw(STORE_KEY, JSON.stringify(clean))
    if (fromLegacy) {
      for (const key of STORE_LEGACY_KEYS) removeRaw(key)
    }
    return clean
  } catch {
    const seeded = emptyBoard()
    saveBoard(seeded)
    return seeded
  }
}

export function saveBoard(board: Board) {
  const clean = sanitizeBoard(board)
  writeRaw(STORE_KEY, JSON.stringify(clean))
}

export function persistLaunch(coin: CoinRecord, remits: RemitRecord[]) {
  const board = loadBoard()
  board.coins = [coin, ...board.coins.filter((c) => c.mint !== coin.mint)].slice(0, 100)
  board.remits = [...remits, ...board.remits].slice(0, 200)
  saveBoard(board)
  syncCoinRemote(coin)
  syncRemitsRemote(remits.filter((r) => r.amountSol > 0 && r.signature))
  return board
}

/** Upsert a coin row (e.g. after wiring fees on an orphan mint). */
export function persistCoin(coin: CoinRecord) {
  const board = loadBoard()
  board.coins = [coin, ...board.coins.filter((c) => c.mint !== coin.mint)].slice(0, 100)
  saveBoard(board)
  syncCoinRemote(coin)
  return board
}

export function persistRemit(remit: RemitRecord) {
  return persistRemits([remit])
}

export function persistRemits(remits: RemitRecord[]) {
  const board = loadBoard()
  board.remits = [...remits, ...board.remits].slice(0, 200)
  saveBoard(board)
  return board
}

/** Replace tape with on-chain distribute rows (deduped, newest first). */
export function persistChainRemits(remits: RemitRecord[]) {
  const board = loadBoard()
  board.remits = remits.slice(0, 200)
  saveBoard(board)
  syncRemitsRemote(remits.filter((r) => r.amountSol > 0 && r.signature))
  return board
}

export function mergeChainRemits(incoming: RemitRecord[]) {
  const board = loadBoard()
  const seen = new Set(board.remits.map((r) => `${r.signature}:${r.wallet}`))
  const merged = [...board.remits]
  for (const row of incoming) {
    const key = `${row.signature}:${row.wallet}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.unshift(row)
  }
  board.remits = merged.slice(0, 200)
  saveBoard(board)
  syncRemitsRemote(incoming.filter((r) => r.amountSol > 0 && r.signature))
  return board
}

/**
 * Pull server board (Postgres) and merge into localStorage.
 * Server coins win on mint collision; remits union by signature+wallet.
 */
export async function hydrateBoardFromApi(): Promise<Board | null> {
  if (!apiConfigured()) return null
  try {
    const remote = await fetchBoard()
    const local = loadBoard()
    const byMint = new Map<string, CoinRecord>()
    for (const c of local.coins) byMint.set(c.mint, c)
    for (const c of remote.coins) byMint.set(c.mint, c)
    const seen = new Set<string>()
    const remits: RemitRecord[] = []
    for (const r of [...remote.remits, ...local.remits]) {
      const key = `${r.signature}:${r.wallet}`
      if (seen.has(key)) continue
      seen.add(key)
      remits.push(r)
    }
    const board = sanitizeBoard({
      coins: [...byMint.values()].sort((a, b) => b.launchedAt - a.launchedAt).slice(0, 100),
      remits: remits.slice(0, 200),
    })
    saveBoard(board)
    return board
  } catch (err) {
    console.warn('API board hydrate failed', err)
    return null
  }
}

export function resetBoard() {
  removeRaw(STORE_KEY)
  for (const key of STORE_LEGACY_KEYS) removeRaw(key)
  const seeded = emptyBoard()
  saveBoard(seeded)
  return seeded
}

/** Persist launch form without File blobs. */
export function saveDraft(draft: LaunchDraft) {
  const clean = sanitizeDraft(draft)
  writeRaw(DRAFT_KEY, JSON.stringify(clean))
}

export function loadDraft(): LaunchDraft | null {
  try {
    const raw = readRaw(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return sanitizeDraft(parsed)
  } catch {
    return null
  }
}

export function clearDraft() {
  removeRaw(DRAFT_KEY)
}

export function saveUiPrefs(prefs: UiPrefs) {
  const clean = sanitizeUiPrefs(prefs)
  writeRaw(UI_KEY, JSON.stringify(clean))
}

export function loadUiPrefs(): UiPrefs {
  try {
    const raw = readRaw(UI_KEY)
    if (!raw) return {}
    return sanitizeUiPrefs(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

export function clearUiPrefs() {
  removeRaw(UI_KEY)
}

/** Full wipe of CREW client persistence (board + draft + ui). */
export function clearAllPersistence() {
  removeRaw(STORE_KEY)
  removeRaw(DRAFT_KEY)
  removeRaw(UI_KEY)
  for (const key of STORE_LEGACY_KEYS) removeRaw(key)
}
