import { describe, it, expect, beforeEach } from 'vitest'
import { generateHashLock, verifyHashPreimage } from '@flop-labs/tclk'
import { memoryJobs } from './store.js'
import { parseAmountToBigint } from './types.js'
import { defaultVerifier } from './verifier.js'
import { rejectCustodialSecrets } from './flop-config.js'
import { FLOP_DEVNET_CHAIN_ID, FLOP_DEVNET_GENESIS_HASH } from './flop-devnet.js'
import { FlopHtlcClient, type EscrowRecord, type FlopChainIo, type FlopHtlcCall, type SubmitResult } from './flop-htlc-client.js'
import type { FlopNetworkIdentity } from './flop-htlc-rpc.js'
import { FlopTclkSettlementRail, resetSharedFlopRail, sharedFlopRail } from './flop-rail.js'
import { railFor } from './settlement.js'

describe('FlopTclkSettlementRail (tclk memory rail)', () => {
  beforeEach(() => {
    resetSharedFlopRail()
    memoryJobs.clearAll()
  })

  it('maps fund → lock → verifyFunding → reveal (release) on MemoryRail', async () => {
    const rail = new FlopTclkSettlementRail({ retainPreimageForTests: true })
    const ctx = { chainId: 'flop-testnet', asset: 'USDC' }
    const amount = parseAmountToBigint(5)
    const funded = await rail.fund(ctx, { amount, from: 'payer-did' })
    expect(funded.escrow.rail).toBe('flop-tclk')
    expect(funded.txRef).toMatch(/^flop-fund:/)
    expect(funded.unsigned).toMatchObject({ kind: 'tclk:lock', rail: 'memory' })
    expect(JSON.stringify(funded)).not.toMatch(/preimage/i)
    expect(rail.htlcStatus(funded.escrow)).toBe('locked')

    const locked = await rail.lock(ctx, funded.escrow)
    expect(locked.ok).toBe(true)

    const vf = await rail.verifyFunding(ctx, funded.escrow)
    expect(vf.ok).toBe(true)

    const preimage = rail.takeTestPreimage(funded.escrow)
    expect(verifyHashPreimage((funded.unsigned as { statement: string }).statement, preimage)).toBe(true)

    const unsignedRelease = await rail.release(ctx, funded.escrow, {
      to: 'kol-wallet',
      amount,
    })
    expect(unsignedRelease.unsigned).toMatchObject({ kind: 'tclk:reveal' })
    expect(rail.htlcStatus(funded.escrow)).toBe('locked')

    const claimed = await rail.reveal(funded.escrow, preimage)
    expect(claimed.txRef).toMatch(/^flop-reveal:/)
    expect(rail.htlcStatus(funded.escrow)).toBe('claimed')
  })

  it('refunds after refundAfterMs via injected clock', async () => {
    let now = 1_700_000_000_000
    const rail = new FlopTclkSettlementRail({ clock: () => now, retainPreimageForTests: true })
    const ctx = { chainId: 'flop-testnet', asset: 'USDC' }
    const funded = await rail.fund(ctx, { amount: 10n })
    expect(rail.htlcStatus(funded.escrow)).toBe('locked')

    await expect(rail.refund(ctx, funded.escrow, { to: 'payer' })).rejects.toThrow(/refund before refundAfterMs/)

    now += 25 * 60 * 60_000
    const out = await rail.refund(ctx, funded.escrow, { to: 'payer' })
    expect(out.txRef).toMatch(/^flop-refund:/)
    expect(rail.htlcStatus(funded.escrow)).toBe('refunded')
  })

  it('rejects private keys and preimages on the SettlementRail surface', async () => {
    const rail = new FlopTclkSettlementRail({ retainPreimageForTests: true })
    const ctx = { chainId: 'flop-testnet', asset: 'USDC' }
    await expect(
      rail.fund(ctx, { amount: 1n, from: 'payer', privateKey: '0xdead' } as never),
    ).rejects.toThrow(/do not send secrets/)
    const funded = await rail.fund(ctx, { amount: 1n, from: 'payer' })
    await expect(
      rail.release(ctx, funded.escrow, { to: 'kol', amount: 1n, preimage: '0xab' } as never),
    ).rejects.toThrow(/do not send secrets/)
    expect(() => rejectCustodialSecrets({ secretKey: 'x' })).toThrow(/do not send secrets/)
  })

  it('rejects a wrong preimage (fail-closed)', async () => {
    const rail = new FlopTclkSettlementRail({ retainPreimageForTests: true })
    const ctx = { chainId: 'flop-testnet', asset: 'USDC' }
    const funded = await rail.fund(ctx, { amount: 1n })
    const other = generateHashLock()
    await expect(rail.reveal(funded.escrow, other.preimage)).rejects.toThrow(/secret does not open/)
    expect(rail.htlcStatus(funded.escrow)).toBe('locked')
  })

  it('looks up escrow by prefixed ref (jobs store escrow.ref)', async () => {
    const rail = new FlopTclkSettlementRail({ retainPreimageForTests: true })
    const ctx = { chainId: 'flop-testnet', asset: 'USDC' }
    const funded = await rail.fund(ctx, { amount: 2n })
    const vf = await rail.verifyFunding(ctx, { id: funded.escrow.ref!, rail: 'flop-tclk' })
    expect(vf.ok).toBe(true)
  })

  it('wires into railFor via explicit rail name and FLOP_ENABLED + chainId', async () => {
    const named = railFor('solana-devnet', 'flop-tclk')
    expect(named.name).toBe('flop-tclk')
    expect(named).toBe(sharedFlopRail())

    const prev = process.env.FLOP_ENABLED
    process.env.FLOP_ENABLED = 'true'
    try {
      const byChain = railFor('flop-testnet')
      expect(byChain.name).toBe('flop-tclk')
    } finally {
      if (prev === undefined) delete process.env.FLOP_ENABLED
      else process.env.FLOP_ENABLED = prev
    }

    const sim = railFor('solana-devnet', 'sim')
    expect(sim.name).toBe('sim')
  })

  it('refuses flop-htlc unless FLOP_CHAIN_ID is flop-devnet', async () => {
    const prevUrl = process.env.FLOP_RPC_URL
    const prevRail = process.env.FLOP_RAIL
    const prevChain = process.env.FLOP_CHAIN_ID
    process.env.FLOP_RPC_URL = 'https://example.invalid/flop-rpc'
    process.env.FLOP_RAIL = 'flop-htlc'
    delete process.env.FLOP_CHAIN_ID
    try {
      const rail = new FlopTclkSettlementRail()
      await expect(rail.fund({ chainId: 'flop-testnet', asset: 'USDC' }, { amount: 1n })).rejects.toThrow(
        /flop-devnet only/,
      )
    } finally {
      if (prevUrl === undefined) delete process.env.FLOP_RPC_URL
      else process.env.FLOP_RPC_URL = prevUrl
      if (prevRail === undefined) delete process.env.FLOP_RAIL
      else process.env.FLOP_RAIL = prevRail
      if (prevChain === undefined) delete process.env.FLOP_CHAIN_ID
      else process.env.FLOP_CHAIN_ID = prevChain
    }
  })

  it('maps fund → verifyFunding → unsigned satisfy on an injected flop-htlc client', async () => {
    const prevUrl = process.env.FLOP_RPC_URL
    const prevRail = process.env.FLOP_RAIL
    const prevChain = process.env.FLOP_CHAIN_ID
    process.env.FLOP_RPC_URL = 'https://rpc.devnet.flop.network'
    process.env.FLOP_RAIL = 'flop-htlc'
    process.env.FLOP_CHAIN_ID = FLOP_DEVNET_CHAIN_ID
    try {
      const io = new (class implements FlopChainIo {
        rpcUrl = 'https://rpc.devnet.flop.network'
        chainId = FLOP_DEVNET_CHAIN_ID
        canSign = false
        escrows = new Map<string, EscrowRecord>()
        async assertIdentity(): Promise<FlopNetworkIdentity> {
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
        async getEscrow(id: string) {
          return this.escrows.get(id) ?? null
        }
        async checkHtlcStatus() {
          return null
        }
        async currentBlock() {
          return 10
        }
        async submit(call: FlopHtlcCall): Promise<SubmitResult> {
          const id = `0x${'aa'.repeat(32)}`
          if (call.method === 'openEscrow') {
            this.escrows.set(id, {
              id,
              funder: '5Funder',
              payee: call.payee,
              amount: call.amount,
              policy: call.policy,
              deadline: 100,
              status: 'Open',
              createdBlock: 1,
            })
            return { txHash: '0xopen', escrowId: id }
          }
          return { txHash: '0xother' }
        }
        async disconnect() {}
      })()
      const rail = new FlopTclkSettlementRail({
        htlc: new FlopHtlcClient(io),
        retainPreimageForTests: true,
      })
      const ctx = { chainId: FLOP_DEVNET_CHAIN_ID, asset: 'USDC' }
      const funded = await rail.fund(ctx, {
        amount: 1n,
        from: '5DRhi7dvWicmgUPfKpxdV5p4kxXiQUbLUFXtwp4EcAWLtu4D',
        to: '5FjCGp7SM7QB7ZsysTR4pTFVd2oY4KGbRAV48h4nWavoPtV6',
      })
      expect(funded.unsigned).toMatchObject({ kind: 'flop-htlc:call', method: 'openEscrow', rail: 'flop-htlc' })
      expect(JSON.stringify(funded)).not.toMatch(/preimage/i)
      expect(funded.escrow.ref).toMatch(/^flop-htlc:pending:/)

      const vf = await rail.verifyFunding(ctx, funded.escrow)
      expect(vf.ok).toBe(false)
      expect(vf.detail).toMatch(/pending/)

      const unsigned = await rail.release(ctx, funded.escrow, { to: 'kol', amount: 1n })
      expect(unsigned.unsigned).toMatchObject({ method: 'satisfyEscrow' })

      const refund = await rail.refund(ctx, funded.escrow, { to: 'payer' })
      expect(refund.unsigned).toMatchObject({ method: 'refundEscrow' })
      expect(rail.connectionHint()).toMatchObject({
        mode: 'flop-htlc',
        chainId: FLOP_DEVNET_CHAIN_ID,
        genesisHash: FLOP_DEVNET_GENESIS_HASH,
      })
    } finally {
      if (prevUrl === undefined) delete process.env.FLOP_RPC_URL
      else process.env.FLOP_RPC_URL = prevUrl
      if (prevRail === undefined) delete process.env.FLOP_RAIL
      else process.env.FLOP_RAIL = prevRail
      if (prevChain === undefined) delete process.env.FLOP_CHAIN_ID
      else process.env.FLOP_CHAIN_ID = prevChain
    }
  })

  it('runs a jobs-store campaign lifecycle with tclk memory settlement', async () => {
    const rail = new FlopTclkSettlementRail({ retainPreimageForTests: true })
    const budget = parseAmountToBigint(4)
    const per = parseAmountToBigint(2)
    const job = memoryJobs.createCampaign({
      createdBy: 'crew_ak_test',
      chainId: 'flop-testnet',
      asset: 'USDC',
      budget,
      perProofAmount: per,
      maxProofs: 4,
      perKOLCap: 2,
      deadline: Date.now() + 6 * 60 * 60_000,
      rules: { requiredTicker: 'HOOT', requiredLink: 'https://pump.fun', platform: 'x' },
    })
    const ctx = { chainId: job.chainId, asset: job.asset }
    const { escrow } = await rail.fund(ctx, { amount: job.budget, from: 'payer' })
    await rail.lock(ctx, escrow)
    const vf = await rail.verifyFunding(ctx, escrow)
    expect(vf.ok).toBe(true)
    job.escrowRef = escrow.ref || escrow.id
    job.status = 'funded'
    memoryJobs.setJob(job)

    const claim = memoryJobs.claimJob(job.id, 'kol-ss58-or-hex', job.chainId, 'owl')
    const submit = memoryJobs.submit(claim.id, {
      urls: ['https://x.com/owl/status/1?ticker=hoot&link=https://pump.fun'],
    })
    const v = await defaultVerifier().verify({
      platform: 'x',
      kolHandle: 'owl',
      urls: submit.urls,
      requiredTicker: 'HOOT',
      requiredLink: 'https://pump.fun',
      minPostAgeHours: 0,
    })
    expect(v.ok).toBe(true)

    const unsigned = await rail.release(ctx, { id: job.escrowRef!, rail: 'flop-tclk' }, {
      to: claim.kolWallet,
      amount: per,
    })
    expect(unsigned.unsigned).toMatchObject({ kind: 'tclk:reveal' })

    const preimage = rail.takeTestPreimage(escrow)
    await rail.reveal({ id: job.escrowRef!, rail: 'flop-tclk' }, preimage)
    expect(rail.htlcStatus({ id: job.escrowRef!, rail: 'flop-tclk' })).toBe('claimed')
  })
})
