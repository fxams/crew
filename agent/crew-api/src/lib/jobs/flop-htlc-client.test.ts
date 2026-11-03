import { describe, expect, it } from 'vitest'
import { FLOP_DEVNET_CHAIN_ID, FLOP_DEVNET_GENESIS_HASH } from './flop-devnet.js'
import {
  FlopHtlcClient,
  hashLockPolicy,
  type EscrowRecord,
  type FlopChainIo,
  type FlopHtlcCall,
  type HtlcRecord,
  type SubmitResult,
} from './flop-htlc-client.js'
import { FlopHtlcError } from './flop-htlc-errors.js'
import type { FlopNetworkIdentity } from './flop-htlc-rpc.js'
import { decodeEscrowJson, escrowIdFromEvents } from './flop-htlc-decode.js'

class FakeIo implements FlopChainIo {
  rpcUrl = 'https://rpc.devnet.flop.network'
  chainId = FLOP_DEVNET_CHAIN_ID
  canSign: boolean
  escrows = new Map<string, EscrowRecord>()
  head = 100
  submitted: FlopHtlcCall[] = []
  identityCalls = 0

  constructor(canSign = true) {
    this.canSign = canSign
  }

  async assertIdentity(): Promise<FlopNetworkIdentity> {
    this.identityCalls += 1
    return {
      chain: 'FLOP Devnet',
      genesisHash: FLOP_DEVNET_GENESIS_HASH,
      specName: 'tzkv-runtime',
      specVersion: 1014003,
      ss58Format: 42,
      tokenDecimals: 18,
      tokenSymbol: 'FLOP',
    }
  }

  async getEscrow(id: string): Promise<EscrowRecord | null> {
    return this.escrows.get(id) ?? this.escrows.get(id.toLowerCase()) ?? null
  }

  async checkHtlcStatus(_hashLock: string): Promise<HtlcRecord | null> {
    return null
  }

  async currentBlock(): Promise<number> {
    return this.head
  }

  async submit(call: FlopHtlcCall): Promise<SubmitResult> {
    this.submitted.push(call)
    if (call.method === 'openEscrow') {
      const id = `0x${'ab'.repeat(32)}`
      this.escrows.set(id, {
        id,
        funder: '5Funder',
        payee: call.payee,
        amount: call.amount,
        policy: call.policy,
        deadline: this.head + call.deadlineBlocks,
        status: 'Open',
        createdBlock: this.head,
      })
      return { txHash: '0xlock', escrowId: id }
    }
    if (call.method === 'satisfyEscrow') {
      const held = this.escrows.get(call.escrowId)
      if (held) held.status = 'Released'
      return { txHash: '0xclaim' }
    }
    const held = this.escrows.get(call.escrowId)
    if (held) held.status = 'Refunded'
    return { txHash: '0xrefund' }
  }

  async disconnect(): Promise<void> {}
}

const PAYEE = '5FjCGp7SM7QB7ZsysTR4pTFVd2oY4KGbRAV48h4nWavoPtV6'
const HASH = `0x${'11'.repeat(32)}`

describe('FlopHtlcClient', () => {
  it('builds And[Hash(h)] openEscrow calls matching live metadata', () => {
    const client = new FlopHtlcClient(new FakeIo(false))
    const call = client.buildOpenEscrow({
      payee: PAYEE,
      amount: 1_000_000_000_000_000n,
      hashLock: HASH,
      deadlineBlocks: 86_400,
    })
    expect(call).toMatchObject({
      pallet: 'hasStation',
      method: 'openEscrow',
      payee: PAYEE,
      deadlineBlocks: 86_400,
    })
    expect(call.method === 'openEscrow' && call.policy).toEqual(hashLockPolicy(HASH))
  })

  it('returns an unsigned openEscrow when no signing URI is configured', async () => {
    const io = new FakeIo(false)
    const client = new FlopHtlcClient(io)
    const out = await client.lock({ payee: PAYEE, amount: 1n, hashLock: HASH, deadlineBlocks: 10 })
    expect(out.txHash).toBeUndefined()
    expect(out.unsigned.method).toBe('openEscrow')
    expect(out.unsigned.note).toMatch(/Never POST/)
    expect(io.submitted).toHaveLength(0)
    expect(io.identityCalls).toBe(1)
  })

  it('submits lock / claim / refund against the mocked chain IO', async () => {
    const io = new FakeIo(true)
    const client = new FlopHtlcClient(io)
    const locked = await client.lock({ payee: PAYEE, amount: 5n, hashLock: HASH, deadlineBlocks: 20 })
    expect(locked.txHash).toBe('0xlock')
    expect(locked.escrowId).toMatch(/^0xab/)

    const claimed = await client.claim(locked.escrowId!, `0x${'22'.repeat(32)}`)
    expect(claimed.txHash).toBe('0xclaim')
    expect((await client.getEscrow(locked.escrowId!))?.status).toBe('Released')
  })

  it('refuses claim/refund without a signing URI and refuses refund before deadline', async () => {
    const io = new FakeIo(false)
    const id = `0x${'cd'.repeat(32)}`
    io.escrows.set(id, {
      id,
      funder: '5Funder',
      payee: PAYEE,
      amount: 1n,
      policy: hashLockPolicy(HASH),
      deadline: 500,
      status: 'Open',
      createdBlock: 1,
    })
    const unsigned = new FlopHtlcClient(io)
    await expect(unsigned.claim(id, HASH)).rejects.toMatchObject({ code: 'MISSING_SIGNER' })
    await expect(unsigned.refund(id)).rejects.toMatchObject({ code: 'MISSING_SIGNER' })

    io.canSign = true
    io.head = 100
    const signed = new FlopHtlcClient(io)
    await expect(signed.refund(id)).rejects.toMatchObject({ code: 'REFUND_NOT_READY' })
    io.head = 500
    const refunded = await signed.refund(id)
    expect(refunded.txHash).toBe('0xrefund')
  })

  it('omits preimages from unsigned satisfy payloads', () => {
    const client = new FlopHtlcClient(new FakeIo(false))
    const unsigned = client.unsignedSatisfy(`0x${'ee'.repeat(32)}`)
    expect(unsigned.args.preimages).toEqual([])
    expect(JSON.stringify(unsigned.args)).not.toMatch(/hash-lock secret/)
    expect(unsigned.method).toBe('satisfyEscrow')
  })

  it('throws a typed error when payee or amount is missing', () => {
    const client = new FlopHtlcClient(new FakeIo(false))
    expect(() => client.buildOpenEscrow({ payee: '', amount: 1n, hashLock: HASH, deadlineBlocks: 1 })).toThrow(
      FlopHtlcError,
    )
    expect(() => client.buildOpenEscrow({ payee: PAYEE, amount: 0n, hashLock: HASH, deadlineBlocks: 1 })).toThrow(
      /amount must be/,
    )
  })
})

describe('has-station JSON helpers', () => {
  it('decodes a live-shaped EscrowRecord', () => {
    const rec = decodeEscrowJson({
      id: '0xa1eb16b7b48ebd47c84322c41b53acd1f9b91a2d6e56a77d38813640b34a5d94',
      funder: '5DRhi7dvWicmgUPfKpxdV5p4kxXiQUbLUFXtwp4EcAWLtu4D',
      payee: PAYEE,
      amount: '1000000000000000',
      policy: { combinator: { and: null }, clauses: [{ hash: HASH }] },
      deadline: 2801479,
      status: 'Refunded',
      createdBlock: 2801459,
    })
    expect(rec?.status).toBe('Refunded')
    expect(rec?.amount).toBe(1_000_000_000_000_000n)
    expect(rec?.policy.clauses).toEqual([{ Hash: HASH }])
  })

  it('reads escrow_id from EscrowOpened events', () => {
    const id = escrowIdFromEvents([
      { event: { section: 'hasStation', method: 'EscrowOpened', data: { escrowId: `0x${'ab'.repeat(32)}` } } },
    ])
    expect(id).toBe(`0x${'ab'.repeat(32)}`)
  })
})
