import { describe, expect, it } from 'vitest'
import { enrichRemitHandle } from './proof.js'
import type { ApiCoin, ApiRemit } from './coins.js'

const coin: ApiCoin = {
  id: 'c1',
  mint: 'GKeoMKEsSZPch2WF8cRk7FLkYwj2kEj2rVWEi92tDkAp',
  name: 'Straw to Gold',
  ticker: 'STRAW2GOLD',
  vibe: '',
  mode: 'agent',
  crew: [
    {
      handle: '@oxrxbt',
      wallet: '5WnAczezsDku4YkJEKW9PUzLm87Wuq6VKczLn8n2YHP2',
      share: 12,
    },
  ],
  signature: 'sig',
  feeShareSignature: 'sig',
  launchedAt: 1,
  launcher: 'Dg85fQuf6MmmiTCyNvKDfaXHzqRvWHd52SRXmGw9EzDN',
  pumpUrl: 'https://pump.fun/coin/x',
  agent: { name: 'Crew Agent', objective: 'hire', model: 'api' },
}

function remit(partial: Partial<ApiRemit> & Pick<ApiRemit, 'wallet' | 'handle'>): ApiRemit {
  return {
    id: 'r1',
    mint: coin.mint,
    ticker: coin.ticker,
    amountSol: 0.001,
    mode: 'agent',
    at: 1,
    ...partial,
  }
}

describe('enrichRemitHandle', () => {
  it('prefers crew handles and agent launcher names', () => {
    expect(
      enrichRemitHandle(
        remit({ wallet: coin.crew[0].wallet, handle: '@xxxx' }),
        coin,
        'DKqEbHvb7KHSdChzF54KTdj6io4dVZvbieFEMcS1C5cw',
      ),
    ).toBe('@oxrxbt')
    expect(
      enrichRemitHandle(
        remit({ wallet: coin.launcher, handle: '@agent' }),
        coin,
        null,
      ),
    ).toBe('@CrewAgent')
  })

  it('labels buyback wallet and expands stubs', () => {
    const buyback = 'DKqEbHvb7KHSdChzF54KTdj6io4dVZvbieFEMcS1C5cw'
    expect(
      enrichRemitHandle(remit({ wallet: buyback, handle: '@DKqE' }), coin, buyback),
    ).toBe('@crew-buyback')
    expect(
      enrichRemitHandle(
        remit({ wallet: '11111111111111111111111111111111', handle: '@1111' }),
        coin,
        buyback,
      ),
    ).toBe('@1111…1111')
  })
})
