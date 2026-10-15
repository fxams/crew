import { describe, expect, it } from 'vitest'
import { canX402Pay, pickBaseAccept } from './x402-pay.js'

describe('x402-pay helpers', () => {
  it('requires a hex key', () => {
    expect(canX402Pay(undefined)).toBe(false)
    expect(canX402Pay('short')).toBe(false)
    expect(canX402Pay(`0x${'ab'.repeat(32)}`)).toBe(true)
  })

  it('picks the Base USDC accept', () => {
    expect(
      pickBaseAccept([
        { network: 'solana', payTo: 'So111', maxAmountRequired: '1' },
        { network: 'base', payTo: '0x1111111111111111111111111111111111111111', maxAmountRequired: '100000' },
      ])?.network,
    ).toBe('base')
    expect(
      pickBaseAccept([
        { network: 'eip155:8453', payTo: '0x1111111111111111111111111111111111111111', amount: '20000' },
      ])?.amount,
    ).toBe('20000')
    expect(pickBaseAccept([{ network: 'solana', payTo: 'So111', maxAmountRequired: '1' }])).toBeNull()
  })
})
