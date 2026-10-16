import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getAgentMintStatus } from './repair.js'

vi.mock('../coins.js', () => ({
  getCoin: vi.fn(async (mint: string) =>
    mint === '0x52c3f4ac350f0ddfae43a9fda7798bb6262535e9'
      ? {
          mint,
          pumpUrl: 'https://sepolia.basescan.org/token/0x52c3f4ac350f0ddfae43a9fda7798bb6262535e9#clanker',
          feeShareSignature: '0xabc',
          name: 'CPTEST',
          ticker: 'CPTEST',
        }
      : null,
  ),
  upsertCoin: vi.fn(),
}))

describe('getAgentMintStatus EVM', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns board status for Clanker EVM mints without Solana RPC', async () => {
    const mint = '0x52c3f4ac350f0ddfae43a9fda7798bb6262535e9'
    const status = await getAgentMintStatus(mint, { platform: 'clanker' })
    expect(status.ok).toBe(true)
    expect(status.mint).toBe(mint)
    expect(status.onBoard).toBe(true)
    expect(status.feeShareLocked).toBe(true)
    expect(status.pumpUrl).toContain('sepolia.basescan.org')
  })
})
