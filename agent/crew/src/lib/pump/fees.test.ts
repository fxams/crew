import { describe, expect, it } from 'vitest'
import { PublicKey } from '@solana/web3.js'
import { buildCrewShareholders } from '../validation'

/** Kibble mainnet mint from the failed fee-share launch. */
const KIBBLE_MINT = 'FWQboeEQgUKdBjWRaHjqREXjL8PGzPAiA25u7n87nE8p'
const FEE_PROGRAM = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ'

describe('fee-share audit helpers', () => {
  it('derives sharing-config PDA under pump fee program for Kibble', () => {
    const mint = new PublicKey(KIBBLE_MINT)
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('sharing-config'), mint.toBuffer()],
      new PublicKey(FEE_PROGRAM),
    )
    expect(pda.toBase58()).toBe('AayUUGPpF8bq5TvSgNXCKS2HV8BjyTnfVgpfS9X3m7cY')
  })

  it('buildCrewShareholders totals 10000 bps for split crew', () => {
    const rows = buildCrewShareholders(
      [
        {
          handle: '@alice',
          wallet: '2dZLkrTTSbsqWFowaSY3yFDR6Uto3kefhMNQG9XCZXtn',
          share: 60,
        },
        {
          handle: '@bob',
          wallet: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          share: 40,
        },
      ],
      'split',
    )
    expect(rows.every((r) => r.role === 'crew')).toBe(true)
    expect(rows.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
  })
})
