import { describe, expect, it, beforeEach } from 'vitest'
import {
  buildLaunchpadLiveCetusMigrateTransaction,
  cetusCoinTypeOrder,
  sqrtPriceX64FromAmounts,
} from './sui-launchpad-migrate.js'

describe('sui-launchpad-migrate', () => {
  beforeEach(() => {
    process.env.CREWPAY_LAUNCHPAD_PACKAGE_ID =
      '0x37cf5eccf86586fb10866c4a703e2098e2462aa437cb48100c04ba5ca57e3f64'
    process.env.CREWPAY_LAUNCHPAD_PUBLISHED_AT =
      '0x27353b5519bc5f3c9a6d543e717a2bce7f1dd66b903f727381b3d8121f431e4c'
  })

  it('orders meme before SUI for Cetus type args', () => {
    const meme =
      '0xf3cffe2511cf84941cea65514a87860385c9fd2feef0b48b411bb650e87da91e::meme::MEME'
    const [a, b] = cetusCoinTypeOrder(meme, '0x2::sui::SUI')
    expect(a).toBe(meme)
    expect(b).toBe('0x2::sui::SUI')
  })

  it('builds live PTB with begin, create_pool_v2, finish (position consumed)', () => {
    const tx = buildLaunchpadLiveCetusMigrateTransaction({
      poolObjectId: '0xdfff986f6a12c29e5fba0fe60bae7bc9c65ca0f94de0a0a43bf54cb83cba85bd',
      memeCoinType:
        '0xf3cffe2511cf84941cea65514a87860385c9fd2feef0b48b411bb650e87da91e::meme::MEME',
      suiReserve: 790400000n,
      memeReserve: 180989223542415031n,
      metadataMemeObjectId: '0xc789bd7d1051e5cdffd076344b2d30ba70617481132b84cb77562389d0b0f979',
      metadataSuiObjectId: '0x587c29de216efd4219573e08a1f6964d4fa7cb714518c2c8a0f29abfa264327d',
      refundAddress: '0x3333333333333333333333333333333333333333333333333333333333333333',
    })
    const calls = tx.getData().commands.filter((c) => c.$kind === 'MoveCall')
    expect(calls.map((c) => c.MoveCall?.function)).toEqual([
      'full_range_tick_range',
      'begin_cetus_ptb_migration',
      'create_cetus_lock_vault_for_ptb',
      'create_pool_v2',
      'object_id',
      'cetus_lock_vault_receive_address',
      'finish_cetus_ptb_migration_locked_owned',
    ])
    const finish = calls[6]?.MoveCall
    expect(finish?.package).toBe(process.env.CREWPAY_LAUNCHPAD_PUBLISHED_AT)
    expect(finish?.arguments?.length).toBe(6)
  })

  it('sqrt price uses amount_b / amount_a (sui per meme)', () => {
    const meme = 180989223542415031n
    const sui = 790400000n
    const p = sqrtPriceX64FromAmounts(meme, sui)
    expect(p).toBeGreaterThan(0n)
    const p2 = sqrtPriceX64FromAmounts(meme, sui * 2n)
    expect(p2).toBeGreaterThan(p)
  })
})
