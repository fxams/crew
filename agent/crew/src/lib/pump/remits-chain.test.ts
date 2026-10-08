import { describe, expect, it } from 'vitest'
import type { CoinRecord } from '../types'
import { isChainRemit, walletToHandle } from './remits-chain-helpers'

const SAMPLE_SIG =
  '52ngPYbrgeLMyGSo9n84hCGykKk9PMZiKaLdh1FnUefbQJMucqyPKMypJgWb8roXfeJepRzV9eJocCEwVxiWQ72v'

const coin: CoinRecord = {
  id: 'c1',
  mint: 'C3zFzELg5yathGjLnGf3bCdqe4G7yVsMjgo8np7CMsRq',
  name: 'Test',
  ticker: 'TST',
  vibe: '',
  mode: 'split',
  crew: [{ handle: '@alice', wallet: 'FMnes5rLCu9UVTGuR4D9SiDGzH19WEBUHNVvzKAL6jT2', share: 100 }],
  signature: SAMPLE_SIG,
  feeShareSignature: SAMPLE_SIG,
  launchedAt: 1,
  launcher: '2dZLkrTTSbsqWFowaSY3yFDR6Uto3kefhMNQG9XCZXtn',
  pumpUrl: 'https://pump.fun/coin/x',
}

describe('remits-chain helpers', () => {
  it('maps crew wallet to handle', () => {
    expect(walletToHandle(coin, coin.crew[0].wallet)).toBe('@alice')
    expect(walletToHandle(coin, coin.launcher)).toBe('@desk')
  })

  it('uses agent name for launcher and expands unknown wallets', () => {
    const agentCoin: CoinRecord = {
      ...coin,
      mode: 'agent',
      agent: { name: 'DeskBot', objective: 'test objective here', model: 'api' },
    }
    expect(walletToHandle(agentCoin, agentCoin.launcher)).toBe('@DeskBot')
    expect(walletToHandle(agentCoin, 'DKqEbHvb7KHSdChzF54KTdj6io4dVZvbieFEMcS1C5cw')).toBe(
      '@DKqE…C5cw',
    )
  })

  it('accepts only paid txs with real signatures', () => {
    expect(
      isChainRemit({
        id: '1',
        mint: coin.mint,
        ticker: 'TST',
        handle: '@a',
        wallet: 'x',
        amountSol: 0.01,
        mode: 'split',
        at: 1,
        signature: SAMPLE_SIG,
        source: 'chain',
      }),
    ).toBe(true)
    expect(
      isChainRemit({
        id: '1',
        mint: coin.mint,
        ticker: 'TST',
        handle: '@a',
        wallet: 'x',
        amountSol: 0,
        mode: 'split',
        at: 1,
        signature: SAMPLE_SIG,
      }),
    ).toBe(false)
  })
})
