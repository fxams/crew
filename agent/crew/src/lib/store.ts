import { STORE_KEY } from './config'
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
    const parsed = JSON.parse(raw) as Board
    return {
      coins: Array.isArray(parsed.coins) ? parsed.coins : [],
      remits: Array.isArray(parsed.remits) ? parsed.remits : [],
    }
  } catch {
    const seeded = emptyBoard()
    saveBoard(seeded)
    return seeded
  }
}

export function saveBoard(board: Board) {
  localStorage.setItem(STORE_KEY, JSON.stringify(board))
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
