import { DRAFT_KEY, STORE_KEY, STORE_LEGACY_KEYS, UI_KEY } from './config'
import { sanitizeBoard, sanitizeDraft, sanitizeUiPrefs } from './security'
import type { CoinRecord, LaunchDraft, RemitRecord } from './types'
import { seedCoins, seedRemits } from './seed'

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
  return board
}

/** Upsert a coin row (e.g. after wiring fees on an orphan mint). */
export function persistCoin(coin: CoinRecord) {
  const board = loadBoard()
  board.coins = [coin, ...board.coins.filter((c) => c.mint !== coin.mint)].slice(0, 100)
  saveBoard(board)
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
