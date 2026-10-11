import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isPlatformTreasury, readLegacyPlatformBuybackWallets } from './agent/constants.js'
import { enrichRemitHandle } from './proof.js'
import type { ApiCoin, ApiRemit } from './coins.js'

describe('platform treasury (current + legacy)', () => {
  const saved = {
    CREW_BUYBACK_WALLET: process.env.CREW_BUYBACK_WALLET,
    CREW_LEGACY_BUYBACK_WALLETS: process.env.CREW_LEGACY_BUYBACK_WALLETS,
  }
  beforeEach(() => {
    delete process.env.CREW_LEGACY_BUYBACK_WALLETS
  })
  afterEach(() => {
    if (saved.CREW_BUYBACK_WALLET) process.env.CREW_BUYBACK_WALLET = saved.CREW_BUYBACK_WALLET
    else delete process.env.CREW_BUYBACK_WALLET
    if (saved.CREW_LEGACY_BUYBACK_WALLETS)
      process.env.CREW_LEGACY_BUYBACK_WALLETS = saved.CREW_LEGACY_BUYBACK_WALLETS
    else delete process.env.CREW_LEGACY_BUYBACK_WALLETS
  })

  it('classifies default legacy DKqE… as platform', () => {
    expect(readLegacyPlatformBuybackWallets()).toContain(
      'DKqEbHvb7KHSdChzF54KTdj6io4dVZvbieFEMcS1C5cw',
    )
    expect(isPlatformTreasury('DKqEbHvb7KHSdChzF54KTdj6io4dVZvbieFEMcS1C5cw')).toBe(true)
  })

  it('classifies current wallet from env as platform', () => {
    process.env.CREW_BUYBACK_WALLET = 'GZ8uScXxk481k5hZwMpPyZEYiDKBiy4ZPPfNd66oJ8Er'
    expect(isPlatformTreasury('GZ8uScXxk481k5hZwMpPyZEYiDKBiy4ZPPfNd66oJ8Er')).toBe(true)
  })

  it('enrichRemitHandle maps platform wallets to @crew-buyback', () => {
    const coin: ApiCoin = {
      id: 'c',
      mint: 'Mint11111111111111111111111111111111',
      name: 'X',
      ticker: 'X',
      vibe: '',
      mode: 'agent',
      crew: [],
      signature: '',
      feeShareSignature: '',
      launchedAt: Date.now(),
      launcher: 'Lau111111111111111111111111111111111',
      pumpUrl: 'https://pump.fun/coin/Mint11111111111111111111111111111111',
      agent: {},
    }
    const r: ApiRemit = {
      id: 'r',
      mint: coin.mint,
      ticker: coin.ticker,
      handle: '@DKqE',
      wallet: 'DKqEbHvb7KHSdChzF54KTdj6io4dVZvbieFEMcS1C5cw',
      amountSol: 0.01,
      mode: 'agent',
      at: Date.now(),
      signature: 'sig',
      source: 'chain',
    }
    expect(enrichRemitHandle(r, coin, null)).toBe('@crew-buyback')
  })
})

