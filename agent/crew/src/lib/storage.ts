import type { Coin, Remit } from './types'
import { seedCoins, seedRemits } from './seed'

const COINS_KEY = 'crew.coins'
const REMITS_KEY = 'crew.remits'

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function loadBoard(): { coins: Coin[]; remits: Remit[] } {
  const coins = readJson<Coin[]>(COINS_KEY)
  const remits = readJson<Remit[]>(REMITS_KEY)

  if (!coins?.length || !remits?.length) {
    const seededCoins = seedCoins()
    const seededRemits = seedRemits(seededCoins)
    writeJson(COINS_KEY, seededCoins)
    writeJson(REMITS_KEY, seededRemits)
    return { coins: seededCoins, remits: seededRemits }
  }

  return { coins, remits }
}

export function saveLaunch(coin: Coin, newRemits: Remit[]) {
  const { coins, remits } = loadBoard()
  writeJson(COINS_KEY, [coin, ...coins.filter((c) => c.id !== coin.id)])
  writeJson(REMITS_KEY, [...newRemits, ...remits].slice(0, 120))
}

export function appendSimulatedRemit(remit: Remit) {
  const { remits } = loadBoard()
  writeJson(REMITS_KEY, [remit, ...remits].slice(0, 120))
}
