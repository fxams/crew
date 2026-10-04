import { STORE_KEY } from './config'
import { sanitizeBoard } from './security'
import type { CoinRecord, RemitRecord } from './types'
import { seedCoins, seedRemits } from './seed'

type Board = {
  coins: CoinRecord[]
  remits: RemitRecord[]
}

function emptyBoard(): Board {
  const coins = seedCoins()
  return { coins, remits: seedRemits(coins) }
}

export function loadBoard(): Board {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) {
      const seeded = emptyBoard()
      saveBoard(seeded)
      return seeded
    }
    const parsed = JSON.parse(raw) as unknown
    return sanitizeBoard(parsed)
  } catch {
    const seeded = emptyBoard()
    saveBoard(seeded)
    return seeded
  }
}

export function saveBoard(board: Board) {
  const clean = sanitizeBoard(board)
  localStorage.setItem(STORE_KEY, JSON.stringify(clean))
}

export function persistLaunch(coin: CoinRecord, remits: RemitRecord[]) {
  const board = loadBoard()
  board.coins = [coin, ...board.coins.filter((c) => c.mint !== coin.mint)].slice(0, 100)
  board.remits = [...remits, ...board.remits].slice(0, 200)
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
  localStorage.removeItem(STORE_KEY)
  const seeded = emptyBoard()
  saveBoard(seeded)
  return seeded
}
