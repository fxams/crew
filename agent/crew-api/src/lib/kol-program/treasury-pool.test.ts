import { describe, expect, it, vi } from 'vitest'
import {
  poolSliceFromReceipts,
  seasonPoolStatusToJson,
  tryCurrentSeasonPoolStatus,
  treasuryReceiptTotalsToJson,
} from './treasury-pool.js'

vi.mock('../db.js', () => ({
  query: vi.fn(async () => {
    throw new Error('db unavailable')
  }),
}))

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

describe('treasuryReceiptTotalsToJson', () => {
  it('stringifies bigint fields for res.json', () => {
    const json = treasuryReceiptTotalsToJson({
      solana: { lamports: 42n, sol: 4.2e-8 },
      base: { wei: 1000n, eth: 1e-15 },
    })
    expect(json.solana.lamports).toBe('42')
    expect(json.base.wei).toBe('1000')
    expect(JSON.stringify(json)).not.toContain('bigint')
  })
})

describe('seasonPoolStatusToJson', () => {
  it('round-trips numeric sol/eth for clients', () => {
    const json = seasonPoolStatusToJson({
      seasonId: 's1',
      poolBps: 2000,
      receipts: {
        solana: { lamports: 1_000_000_000n, sol: 1 },
        base: { wei: 0n, eth: 0 },
      },
      poolSlice: {
        solana: { lamports: 200_000_000n, sol: 0.2 },
        base: { wei: 0n, eth: 0 },
      },
      disclaimer: 'd',
      copy: 'c',
    })
    expect(json.poolSlice.solana.sol).toBe(0.2)
    expect(() => JSON.stringify(json)).not.toThrow()
  })
})

describe('tryCurrentSeasonPoolStatus', () => {
  it('returns ok:false when pool sync fails', async () => {
    const result = await tryCurrentSeasonPoolStatus('season-test')
    expect(result.ok).toBe(false)
  })
})
