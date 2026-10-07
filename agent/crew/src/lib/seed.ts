import type { CoinRecord, RemitRecord } from './types'

/** Production board starts empty — only real launches appear. */
export function seedCoins(): CoinRecord[] {
  return []
}

export function seedRemits(_coins: CoinRecord[]): RemitRecord[] {
  return []
}
