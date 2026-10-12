import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { resolveOpsPayer } from './send.js'

describe('resolveOpsPayer', () => {
  const saved = {
    CREW_OPS_KEY: process.env.CREW_OPS_KEY,
    CREW_BUYBACK_PRIVATE_KEY: process.env.CREW_BUYBACK_PRIVATE_KEY,
  }
  beforeEach(() => {
    delete process.env.CREW_OPS_KEY
    delete process.env.CREW_BUYBACK_PRIVATE_KEY
  })
  afterEach(() => {
    if (saved.CREW_OPS_KEY === undefined) delete process.env.CREW_OPS_KEY
    else process.env.CREW_OPS_KEY = saved.CREW_OPS_KEY
    if (saved.CREW_BUYBACK_PRIVATE_KEY === undefined) {
      delete process.env.CREW_BUYBACK_PRIVATE_KEY
    } else {
      process.env.CREW_BUYBACK_PRIVATE_KEY = saved.CREW_BUYBACK_PRIVATE_KEY
    }
  })

  it('does not fall back to CREW_BUYBACK_PRIVATE_KEY', () => {
    const kp = Keypair.generate()
    process.env.CREW_BUYBACK_PRIVATE_KEY = bs58.encode(kp.secretKey)
    expect(() => resolveOpsPayer()).toThrow(/CREW_OPS_KEY/)
  })

  it('uses CREW_OPS_KEY when set', () => {
    const kp = Keypair.generate()
    process.env.CREW_OPS_KEY = bs58.encode(kp.secretKey)
    expect(resolveOpsPayer().publicKey.toBase58()).toBe(kp.publicKey.toBase58())
  })
})
