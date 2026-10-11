import { describe, expect, it } from 'vitest'
import type { ApiRemit } from './coins.js'
import { buildCrewLeaderboardFromRemits } from './proof.js'

function remit(partial: Partial<ApiRemit> & Pick<ApiRemit, 'handle' | 'wallet' | 'mint' | 'ticker'>): ApiRemit {
  return {
    id: `${partial.mint}-${partial.wallet}-${partial.ticker}`,
    mint: partial.mint,
    ticker: partial.ticker,
    handle: partial.handle,
    wallet: partial.wallet,
    amountSol: partial.amountSol ?? 0.01,
    mode: 'split',
    at: Date.now(),
    signature: 'sig',
    source: 'chain',
    role: (partial as any).role,
  }
}

describe('buildCrewLeaderboardFromRemits', () => {
  it('excludes desk/treasury/referrer roles and keeps crew-only', () => {
    const remits: (ApiRemit & { role?: string })[] = [
      remit({ mint: 'm1', wallet: 'w1', ticker: 'AAA', handle: '@alice', amountSol: 0.03, role: 'crew' }),
      remit({ mint: 'm1', wallet: 'w2', ticker: 'AAA', handle: '@desk-ops', amountSol: 0.02, role: 'desk' }),
      remit({ mint: 'm1', wallet: 'w3', ticker: 'AAA', handle: '@crew-buyback', amountSol: 0.02, role: 'platform' }),
      remit({ mint: 'm2', wallet: 'w4', ticker: 'BBB', handle: '@bob', amountSol: 0.01, role: 'crew' }),
      remit({ mint: 'm2', wallet: 'w5', ticker: 'BBB', handle: '@ref', amountSol: 0.01, role: 'agent-referral' }),
    ]
    const board = buildCrewLeaderboardFromRemits(remits, 8)
    expect(board.map((r) => r.handle)).toEqual(['@alice', '@bob'])
    expect(board[0]?.totalSol).toBeCloseTo(0.03)
  })
})

