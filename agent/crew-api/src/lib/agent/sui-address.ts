import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils'

/** Sui address (0x + 32 bytes). Distinct from EVM (20-byte) by length. */
export function isSuiAddress(value: string | null | undefined): boolean {
  const w = (value || '').trim()
  if (!w.startsWith('0x')) return false
  return isValidSuiAddress(w)
}

export function assertSuiAddress(value: string, label = 'address'): string {
  const w = (value || '').trim()
  if (!isSuiAddress(w)) {
    throw new Error(`Invalid Sui ${label}: expected 0x… (32-byte address).`)
  }
  return normalizeSuiAddress(w)
}
