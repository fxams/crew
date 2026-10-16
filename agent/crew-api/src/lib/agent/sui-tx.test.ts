import { describe, expect, it } from 'vitest'
import { parseSuiSignedSubmitPayload } from './sui-tx.js'

describe('parseSuiSignedSubmitPayload', () => {
  it('parses transactionBlock + signature JSON', () => {
    const payload = Buffer.from(
      JSON.stringify({ transactionBlock: 'AAA', signature: 'sig' }),
      'utf8',
    ).toString('base64')
    expect(parseSuiSignedSubmitPayload(payload)).toEqual({
      transactionBlock: 'AAA',
      signature: 'sig',
    })
  })

  it('accepts bytes alias', () => {
    const payload = Buffer.from(
      JSON.stringify({ bytes: 'BBB', signature: ['s1', 's2'] }),
      'utf8',
    ).toString('base64')
    expect(parseSuiSignedSubmitPayload(payload)).toEqual({
      transactionBlock: 'BBB',
      signature: ['s1', 's2'],
    })
  })
})
