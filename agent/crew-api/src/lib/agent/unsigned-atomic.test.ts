import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Keypair, SystemProgram } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'
import {
  FEES_LOCKED_AT_LAUNCH_PAIR,
  FEES_LOCKED_AT_LAUNCH_SINGLE,
  SOLANA_PACKET_LIMIT,
  chooseUnsignedPumpLockPath,
  compactU16Bytes,
  compileUnsignedV0,
  signedV0Bytes,
} from './unsigned-atomic.js'

const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N'

describe('unsigned Pump create+fee-share packing', () => {
  it('signed v0 size is shortvec + 64-byte sigs + message', () => {
    expect(compactU16Bytes(2)).toBe(1)
    expect(signedV0Bytes(1000, 2)).toBe(1 + 128 + 1000)
    expect(signedV0Bytes(1200, 2)).toBe(1 + 128 + 1200)
  })

  it('prefers a single v0 tx when create+lock fits the packet', () => {
    expect(chooseUnsignedPumpLockPath(1129)).toBe('atomic-v0')
    expect(chooseUnsignedPumpLockPath(SOLANA_PACKET_LIMIT)).toBe('atomic-v0')
    expect(chooseUnsignedPumpLockPath(SOLANA_PACKET_LIMIT + 1)).toBe('signAllTransactions')
  })

  it('compiles a tiny transfer under the packet limit (same-tx path is possible)', () => {
    const payer = Keypair.generate()
    const to = Keypair.generate()
    const compiled = compileUnsignedV0({
      payer: payer.publicKey,
      ixs: [
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: to.publicKey,
          lamports: 1,
        }),
      ],
      blockhash: BLOCKHASH,
    })
    expect(compiled.numSigners).toBe(1)
    expect(compiled.signedBytes).toBeLessThanOrEqual(SOLANA_PACKET_LIMIT)
    expect(chooseUnsignedPumpLockPath(compiled.signedBytes)).toBe('atomic-v0')
    expect(Buffer.from(compiled.messageBase64, 'base64').byteLength).toBe(compiled.messageBytes)
  })

  it('a synthetic combined size over 1232 selects the signAllTransactions pair', () => {
    expect(chooseUnsignedPumpLockPath(signedV0Bytes(1400, 2))).toBe('signAllTransactions')
  })

  it('oversized compile falls back to pair path instead of throwing', () => {
    const payer = Keypair.generate()
    const ixs = Array.from({ length: 40 }, () =>
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1,
      }),
    )
    const compiled = compileUnsignedV0({
      payer: payer.publicKey,
      ixs,
      blockhash: BLOCKHASH,
    })
    expect(compiled.signedBytes).toBeGreaterThan(SOLANA_PACKET_LIMIT)
    expect(chooseUnsignedPumpLockPath(compiled.signedBytes)).toBe('signAllTransactions')
  })

  it('launch copy says fees lock at launch and the pair is signed together', () => {
    expect(FEES_LOCKED_AT_LAUNCH_SINGLE).toMatch(/Fees are locked at launch/)
    expect(FEES_LOCKED_AT_LAUNCH_SINGLE).toMatch(/single v0/)
    expect(FEES_LOCKED_AT_LAUNCH_PAIR).toMatch(/Fees are locked at launch/)
    expect(FEES_LOCKED_AT_LAUNCH_PAIR).toMatch(/signAllTransactions/)
    expect(FEES_LOCKED_AT_LAUNCH_PAIR).toMatch(/Do not skip the lock step/)
    expect(FEES_LOCKED_AT_LAUNCH_PAIR).toMatch(/repair-only/)
  })

  it('unsigned Pump builder always packs fee-share with create', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'unsigned.ts'), 'utf8')
    expect(src).toContain('createFeeSharingConfig')
    expect(src).toContain('updateFeeSharesV2')
    expect(src).toContain('[...createIxs, ...feeIxs]')
    expect(src).toContain('feesLockedAtLaunch: true')
    expect(src).toContain('signAllTransactions')
  })
})
