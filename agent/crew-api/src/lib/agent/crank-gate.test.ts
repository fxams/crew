import { describe, expect, it } from 'vitest'
import { canServerPayCrank, serverPaidCrankDeniedMessage } from './crank-gate.js'
import type { ApiCoin } from '../coins.js'

function coin(partial: Partial<ApiCoin>): ApiCoin {
  return {
    id: 'c1',
    mint: 'Mint111111111111111111111111111111111111111',
    name: 'T',
    ticker: 'T',
    vibe: '',
    mode: 'agent',
    crew: [],
    signature: 'sig',
    launchedAt: Date.now(),
    launcher: 'L',
    pumpUrl: 'https://pump.fun',
    ...partial,
  }
}

describe('crank gate', () => {
  it('denies server-paid crank when mint missing or unlocked', () => {
    expect(canServerPayCrank(null)).toBe(false)
    expect(canServerPayCrank(undefined)).toBe(false)
    expect(canServerPayCrank(coin({}))).toBe(false)
    expect(canServerPayCrank(coin({ feeShareSignature: '' }))).toBe(false)
    expect(serverPaidCrankDeniedMessage()).toMatch(/x-launcher-key required/)
  })

  it('allows server-paid crank for board mint with feeShareSignature', () => {
    expect(canServerPayCrank(coin({ feeShareSignature: 'feesig' }))).toBe(true)
  })
})
