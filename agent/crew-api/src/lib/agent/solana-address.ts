import { PublicKey } from '@solana/web3.js'
import { z } from 'zod'

/** Zod string that must decode as a Solana public key. */
export const solanaAddress = z
  .string()
  .min(32)
  .max(64)
  .refine(
    (v) => {
      try {
        // eslint-disable-next-line no-new
        new PublicKey(v)
        return true
      } catch {
        return false
      }
    },
    { message: 'Invalid Solana address' },
  )

export function assertSolanaAddress(value: string, label = 'address'): string {
  try {
    return new PublicKey(value.trim()).toBase58()
  } catch {
    throw new Error(`Invalid Solana ${label}`)
  }
}
