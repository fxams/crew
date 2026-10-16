import { describe, expect, it } from 'vitest'
import { evmAddressFieldError, isEvmAddress } from './evm-address'

describe('evm-address', () => {
  it('accepts a checksummed-length address', () => {
    expect(isEvmAddress('0xAbCdEf0123456789abcdef0123456789ABCDEF01')).toBe(true)
    expect(evmAddressFieldError('')).toBeNull()
  })

  it('rejects partial or bad prefixes', () => {
    expect(isEvmAddress('0x1234')).toBe(false)
    expect(evmAddressFieldError('0x1234')).toMatch(/full address/i)
    expect(evmAddressFieldError('deadbeef')).toMatch(/0x/)
  })
})
