import { describe, expect, it } from 'vitest'
import { toAutohireInput, toUnsignedInput } from './fulfill.js'

describe('ACP → x402 fulfillment mapping', () => {
  it('passes mint/platform/budget seats and payer identity into Autohire', () => {
    const input = toAutohireInput(
      {
        mint: 'So11111111111111111111111111111111111111112',
        platform: 'bags',
        budget: 4,
        optInOnly: false,
      },
      { payerWallet: '0xabc', offering: 'crewpay_autohire_kol_crew' },
    )
    expect(input.mint).toMatch(/^So111/)
    expect(input.platform).toBe('bags')
    expect(input.seats).toBe(4)
    expect(input.payerWallet).toBe('0xabc')
  })

  it('maps launch to unsigned-build and defaults autoHire', () => {
    const input = toUnsignedInput(
      {
        name: 'Night Owl',
        ticker: 'HOOT',
        platform: 'pumpfun',
        launcherPubkey: 'So11111111111111111111111111111111111111112',
        imageUrl: 'https://example.com/hoot.png',
      },
      { payerWallet: '0xpayer', offering: 'crewpay_launch_with_crew' },
    )
    expect(input.autoHire).toEqual({ seats: 5 })
    expect(input.payerWallet).toBe('0xpayer')
    expect(input.launcherPubkey).toMatch(/^So111/)
  })
})
