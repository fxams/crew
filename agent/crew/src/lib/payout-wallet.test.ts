import { describe, expect, it } from 'vitest'
import { ADD_WALLET_TO_RECEIVE, NO_CRYPTO_NEEDED, SOCIAL_WALLET_LABEL } from './kol-onboarding'
import { isPayoutWallet, resolvePhantomAppId, vitePhantomAppId } from './payout-wallet'

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

describe('Phantom app id', () => {
  it('hides social wallet when no env or API id is set', () => {
    expect(vitePhantomAppId()).toBe('')
    expect(resolvePhantomAppId('')).toBe('')
    expect(resolvePhantomAppId('portal-app')).toBe('portal-app')
  })
})

describe('onboarding copy', () => {
  it('keeps the crypto-new signup promise', () => {
    expect(NO_CRYPTO_NEEDED).toBe('No crypto needed. Just an X account.')
    expect(ADD_WALLET_TO_RECEIVE).toBe(
      'Add a wallet to get hired and paid. KOLs without a wallet are skipped for crews.',
    )
    expect(SOCIAL_WALLET_LABEL).toBe('Create a wallet with Google/Apple')
  })
})
