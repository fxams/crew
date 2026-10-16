import { describe, expect, it } from 'vitest'
import {
  normalizeMemeType,
  parsePoolObjectJson,
  parseTradeEvent,
  poolStage,
} from './sui-launchpad-public.js'
import { minOutWithSlippage, quoteBuy } from './sui-launchpad-curve.js'

describe('sui-launchpad-public', () => {
  it('normalizes meme type address', () => {
    expect(
      normalizeMemeType('6ff444416ce0443d3e1dadd82d8c32d425c2fe82420c6d0c9cac2bb638e9f219::meme::MEME'),
    ).toMatch(/^0x6ff444/)
  })

  it('parses pool json and stage', () => {
    const p = parsePoolObjectJson('0x268c853247f5f4b2314a4488930826746769413592310e46af0f4c783bd11020', {
      sui: '523640000',
      meme: '431201164449529657',
      target_sui: '500000000',
      virtual_sui: '5000000000',
      virtual_meme: '5000000000000000000',
      graduated: true,
      migrated: false,
      launcher: '0x3adc8110d0a00a4d270238e49819fed76e6c9eaaf690c5331a8af1947089d473',
      meme_type: '6ff444416ce0443d3e1dadd82d8c32d425c2fe82420c6d0c9cac2bb638e9f219::meme::MEME',
    })
    expect(p.graduated).toBe(true)
    expect(p.progressBps).toBe(10_000)
    expect(poolStage(p)).toBe('graduated')
  })

  it('parses buy and sell events', () => {
    const buy = parseTradeEvent('0xabc::pool::Bought', {
      pool_id: '0x1',
      sui_in: '1000',
      meme_out: '2000',
      fee_sui: '12',
    })
    expect(buy?.kind).toBe('buy')
    expect(buy?.feeSui).toBe(12n)
    const sell = parseTradeEvent('0xabc::pool::Sold', {
      pool_id: '0x1',
      meme_in: '50',
      sui_out: '40',
      fee_sui: '1',
    })
    expect(sell?.kind).toBe('sell')
  })

  it('curve quote and slippage', () => {
    const out = quoteBuy(100_000_000n, 0n, 1_000_000_000_000_000_000n, 5_000_000_000n, 5_000_000_000_000_000_000n)
    expect(out).toBeGreaterThan(0n)
    expect(minOutWithSlippage(out, 300)).toBeLessThan(out)
  })
})
