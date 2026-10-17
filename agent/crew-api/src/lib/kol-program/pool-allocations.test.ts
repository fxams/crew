import { describe, expect, it } from 'vitest'
import { proRataAllocations } from './pool-allocations.js'

describe('proRataAllocations', () => {
  it('splits pool slice by season points', () => {
    const pool = {
      solana: { lamports: 1_000_000_000n, sol: 1 },
      base: { wei: 0n, eth: 0 },
    }
    const rows = proRataAllocations(
      [
        {
          xUserId: '1',
          handle: 'a',
          seasonPoints: 30,
          founderNumber: 1,
          wallet: 'So11111111111111111111111111111111111111112',
          evmWallet: null,
        },
        {
          xUserId: '2',
          handle: 'b',
          seasonPoints: 70,
          founderNumber: null,
          wallet: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          evmWallet: null,
        },
      ],
      pool,
    )
    expect(rows).toHaveLength(2)
    const totalLamports = rows.reduce((s, r) => s + BigInt(r.solanaLamports), 0n)
    expect(totalLamports).toBe(1_000_000_000n)
    expect(Number(rows[0]!.solanaLamports)).toBeLessThan(Number(rows[1]!.solanaLamports))
  })
})
