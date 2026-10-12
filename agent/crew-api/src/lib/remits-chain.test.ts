import { describe, expect, it } from 'vitest'
import { remitPaidInRows } from './remits-chain.js'
import { isValidPumpFunUrl } from './pump-creator.js'

describe('remitPaidInRows', () => {
  it('requires a matching positive payout wallet', () => {
    expect(
      remitPaidInRows(
        [
          { signature: 's', wallet: 'Aaa', amountSol: 0.1, at: 1 },
          { signature: 's', wallet: 'Bbb', amountSol: 0, at: 1 },
        ],
        'Aaa',
      ),
    ).toBe(true)
    expect(remitPaidInRows([{ signature: 's', wallet: 'Aaa', amountSol: 0.1, at: 1 }], 'Zzz')).toBe(
      false,
    )
  })
})

describe('isValidPumpFunUrl', () => {
  it('allows https pump.fun only', () => {
    expect(isValidPumpFunUrl('https://pump.fun/coin/abc')).toBe(true)
    expect(isValidPumpFunUrl('https://www.pump.fun/coin/abc')).toBe(true)
    expect(isValidPumpFunUrl('http://pump.fun/coin/abc')).toBe(false)
    expect(isValidPumpFunUrl('https://evil.com/?u=pump.fun')).toBe(false)
  })
})
