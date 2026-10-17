import { describe, expect, it } from 'vitest'
import { poolSliceFromReceipts } from './treasury-pool.js'

describe('poolSliceFromReceipts', () => {
  it('applies pool bps to indexed receipts', () => {
    const slice = poolSliceFromReceipts(
      {
        solana: { lamports: 10_000_000_000n, sol: 10 },
        base: { wei: 0n, eth: 0 },
      },
      2000,
    )
    expect(slice.solana.lamports).toBe(2_000_000_000n)
    expect(slice.solana.sol).toBe(2)
  })
})
