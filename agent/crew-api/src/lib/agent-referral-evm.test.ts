import { describe, expect, it } from 'vitest'
import { referrerPayoutWallet } from './agent-referral.js'

const SOL = 'So11111111111111111111111111111111111111112'
const EVM = '0x4444444444444444444444444444444444444444'

describe('referrerPayoutWallet', () => {
  it('returns evm_wallet on EVM launches', () => {
    const payout = referrerPayoutWallet(
      {
        code: 'alice',
        wallet: SOL,
        evmWallet: EVM,
        handle: '@alice',
        xUsername: 'alice',
      },
      'evm',
    )
    expect(payout?.toLowerCase()).toBe(EVM)
  })

  it('returns null on EVM when referrer has no Base wallet', () => {
    const payout = referrerPayoutWallet(
      {
        code: 'alice',
        wallet: SOL,
        evmWallet: null,
        handle: '@alice',
        xUsername: 'alice',
      },
      'evm',
    )
    expect(payout).toBeNull()
  })

  it('returns Solana wallet on Solana launches', () => {
    const payout = referrerPayoutWallet(
      {
        code: 'alice',
        wallet: SOL,
        evmWallet: EVM,
        handle: '@alice',
        xUsername: 'alice',
      },
      'solana',
    )
    expect(payout).toBe(SOL)
  })
})
