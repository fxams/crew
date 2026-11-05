import { describe, expect, it } from 'vitest'
import { FLOP_DEVNET_FAUCET_URL, toHttpRpcUrl, toWsRpcUrl } from './flop-devnet.js'
import { FlopHtlcError } from './flop-htlc-errors.js'
import {
  assertPayeeHasExistentialDeposit,
  requireEscrowId,
  waitForInBlock,
} from './flop-htlc-submit.js'

describe('RPC URL rewrite', () => {
  it('converts https submit URLs to wss and leaves wss unchanged', () => {
    expect(toWsRpcUrl('https://rpc.devnet.flop.network')).toBe('wss://rpc.devnet.flop.network')
    expect(toWsRpcUrl('http://127.0.0.1:9944')).toBe('ws://127.0.0.1:9944')
    expect(toWsRpcUrl('wss://rpc.devnet.flop.network')).toBe('wss://rpc.devnet.flop.network')
  })

  it('converts wss read URLs to https', () => {
    expect(toHttpRpcUrl('wss://rpc.devnet.flop.network')).toBe('https://rpc.devnet.flop.network')
    expect(toHttpRpcUrl('https://rpc.devnet.flop.network')).toBe('https://rpc.devnet.flop.network')
  })
})

describe('requireEscrowId', () => {
  it('throws a clear error for empty or zero ids', () => {
    expect(() => requireEscrowId('')).toThrow(FlopHtlcError)
    expect(() => requireEscrowId('0x')).toThrow(/no escrow id/)
    expect(() => requireEscrowId(`0x${'00'.repeat(32)}`, '0xabc')).toThrow(/tx 0xabc/)
    try {
      requireEscrowId(undefined)
    } catch (err) {
      expect(err).toMatchObject({ code: 'ESCROW_ID_MISSING' })
    }
  })

  it('normalizes a live escrow id', () => {
    expect(requireEscrowId(`0x${'AB'.repeat(32)}`)).toBe(`0x${'ab'.repeat(32)}`)
  })
})

describe('assertPayeeHasExistentialDeposit', () => {
  const payee = '5FjCGp7SM7QB7ZsysTR4pTFVd2oY4KGbRAV48h4nWavoPtV6'

  it('allows a live payee and fails early on a dead account', () => {
    expect(() => assertPayeeHasExistentialDeposit(payee, 1n, 1n)).not.toThrow()
    expect(() => assertPayeeHasExistentialDeposit(payee, 10n, 1n)).not.toThrow()
    expect(() => assertPayeeHasExistentialDeposit(payee, 0n, 1n)).toThrow(FlopHtlcError)
    try {
      assertPayeeHasExistentialDeposit(payee, 0n, 1n)
    } catch (err) {
      expect(err).toMatchObject({ code: 'PAYEE_DEAD_ACCOUNT' })
      expect(String(err)).toMatch(/DeadAccount/)
      expect(String(err)).toContain(FLOP_DEVNET_FAUCET_URL)
    }
  })
})

describe('waitForInBlock', () => {
  it('fails immediately when https-style status is undefined (does not hang)', async () => {
    const started = Date.now()
    await expect(
      waitForInBlock(async (cb) => {
        cb({ status: undefined, txHash: { toHex: () => '0xdead' } })
      }),
    ).rejects.toMatchObject({ code: 'SUBMIT_FAILED' })
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('times out with SUBMIT_TIMEOUT instead of hanging', async () => {
    await expect(waitForInBlock(async () => undefined, { timeoutMs: 40 })).rejects.toMatchObject({
      code: 'SUBMIT_TIMEOUT',
    })
  })

  it('resolves on in-block and rejects dropped/invalid', async () => {
    await expect(
      waitForInBlock(async (cb) => {
        cb({
          status: { isInBlock: true },
          events: [{ method: 'EscrowOpened' }],
          txHash: { toHex: () => '0xlock' },
        })
      }),
    ).resolves.toMatchObject({ txHash: '0xlock' })

    await expect(
      waitForInBlock(async (cb) => {
        cb({ status: { isDropped: true }, txHash: { toHex: () => '0xnope' } })
      }),
    ).rejects.toMatchObject({ code: 'SUBMIT_FAILED' })
  })
})
