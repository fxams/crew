import { describe, expect, it } from 'vitest'
import {
  ADD_WALLET_TO_RECEIVE,
  NO_CRYPTO_NEEDED,
  SOCIAL_WALLET_LABEL,
  SOCIAL_WALLET_NOTE,
} from './kol-onboarding'
import { isPayoutWallet } from './payout-wallet'
import { resolvePrivyAppId, vitePrivyAppId } from './privy-app'

describe('payout wallet guard', () => {
  it('rejects empty destinations', () => {
    expect(isPayoutWallet('')).toBe(false)
    expect(isPayoutWallet(null)).toBe(false)
    expect(isPayoutWallet('short')).toBe(false)
    expect(isPayoutWallet('0x1111111111111111111111111111111111111111')).toBe(false)
  })

  it('accepts a base58 Solana address', () => {
    expect(isPayoutWallet('8x3KqP7nR2mYvC4wL9tHjF6sD1aB0eU5gN8cQ3zW7pXk')).toBe(true)
  })
})

describe('Privy app id', () => {
  it('hides Privy UI when no env or API id is set', () => {
    expect(vitePrivyAppId({})).toBe('')
    expect(resolvePrivyAppId('', {})).toBe('')
    expect(resolvePrivyAppId('dashboard-app', {})).toBe('dashboard-app')
  })

  it('reads VITE_PRIVY_APP_ID when Render sets it', () => {
    expect(vitePrivyAppId({ VITE_PRIVY_APP_ID: ' clappid ' })).toBe('clappid')
    expect(resolvePrivyAppId('', { VITE_PRIVY_APP_ID: 'clappid' })).toBe('clappid')
  })
})

describe('onboarding copy', () => {
  it('keeps the crypto-new signup promise', () => {
    expect(NO_CRYPTO_NEEDED).toBe('No crypto needed. Just an X account.')
    expect(ADD_WALLET_TO_RECEIVE).toBe(
      'Add a wallet to get hired and paid. KOLs without a wallet are skipped for crews.',
    )
    expect(SOCIAL_WALLET_LABEL).toBe('Create a payout wallet')
    expect(SOCIAL_WALLET_NOTE).toMatch(/Privy embedded Solana/)
  })
})
