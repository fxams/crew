import { randomBytes } from 'node:crypto'
import { generateHashLock, MemoryRail, type LockTerms } from '@flop-labs/tclk'
import {
  flopChainId,
  flopExpectedGenesisHash,
  flopRailMode,
  flopRpcUrl,
  flopSigningUri,
  rejectCustodialSecrets,
} from './flop-config.js'
import { FLOP_DEVNET_CHAIN_ID, FLOP_DEVNET_GENESIS_HASH } from './flop-devnet.js'
import { FlopHtlcClient, type EscrowRecord } from './flop-htlc-client.js'
import { FlopHtlcError } from './flop-htlc-errors.js'
import type {
  EscrowRef,
  FundRequest,
  RefundRequest,
  ReleaseRequest,
  SettlementContext,
  SettlementRail,
} from './settlement.js'

export type FlopHtlcStatus = 'locked' | 'claimed' | 'refunded'

type Hold = {
  id: string
  ref: string
  terms: LockTerms
  remaining: bigint
}

export type FlopTclkRailOptions = {
  /** Injected clock so tests can open the refund window without sleeping. */
  clock?: () => number
  /**
   * Test-only: keep the hash-lock preimage in-process so tests can call `reveal`.
   * Never returned from SettlementRail methods and never accepted from callers.
   */
  retainPreimageForTests?: boolean
  /** Force the tclk memory rail even if FLOP_RPC_URL is set. */
  forceMemory?: boolean
  /** Injected flop-htlc client (tests). Production constructs one lazily. */
  htlc?: FlopHtlcClient
}

const DEFAULT_REFUND_WINDOW_MS = 24 * 60 * 60_000
const DEFAULT_CLAIM_LEAD_MS = 60 * 60_000

function contractId(): string {
  return `0x${randomBytes(32).toString('hex')}`
}

/**
 * CrewPay SettlementRail mapped onto tclk HTLC lock / reveal / refund.
 *
 *   fund           → MemoryRail.lock or hasStation.openEscrow
 *   lock           → verifyLock / escrow status read
 *   verifyFunding  → verifyLock / escrow status read
 *   release        → unsigned reveal / satisfyEscrow (client-held preimage)
 *   refund         → MemoryRail.refund or hasStation.refundEscrow
 *
 * Job accept / submit / verify stay off-rail in the jobs store and HTTP routes.
 *
 * The live path is a community flop-devnet adapter (off by default). It is not
 * a partnership. Non-custodial: HTTP never accepts private keys or preimages.
 * A process-local signing URI may be read from FLOP_SIGNING_URI only.
 */
export class FlopTclkSettlementRail implements SettlementRail {
  public readonly name = 'flop-tclk'
  private readonly clock: () => number
  private readonly memory: MemoryRail
  private readonly holds = new Map<string, Hold>()
  private readonly testPreimages = new Map<string, string>()
  private readonly remote: boolean
  private readonly rpcUrl: string | null
  private readonly chainId: string
  private readonly injectedHtlc?: FlopHtlcClient
  private htlcPromise?: Promise<FlopHtlcClient>

  constructor(opts?: FlopTclkRailOptions) {
    this.clock = opts?.clock ?? Date.now
    this.memory = new MemoryRail('memory', this.clock)
    this.rpcUrl = flopRpcUrl()
    this.chainId = flopChainId()
    this.remote = !opts?.forceMemory && flopRailMode() === 'flop-htlc'
    this.injectedHtlc = opts?.htlc
    if (opts?.retainPreimageForTests) {
      this.retainPreimageForTests = true
    }
  }

  private retainPreimageForTests = false

  private assertRemoteReady(): void {
    if (!this.remote) return
    if (this.chainId.toLowerCase() !== FLOP_DEVNET_CHAIN_ID) {
      throw new FlopHtlcError(
        'UNSUPPORTED_CHAIN',
        `flop-htlc is flop-devnet only. Set FLOP_CHAIN_ID=${FLOP_DEVNET_CHAIN_ID} (got ${this.chainId}).`,
      )
    }
    if (!this.rpcUrl && !this.injectedHtlc) {
      throw new FlopHtlcError('INVALID_PARAMS', 'FLOP_RPC_URL is required for FLOP_RAIL=flop-htlc')
    }
  }

  private async htlc(): Promise<FlopHtlcClient> {
    this.assertRemoteReady()
    if (this.injectedHtlc) return this.injectedHtlc
    if (!this.htlcPromise) {
      const rpcUrl = this.rpcUrl
      if (!rpcUrl) throw new FlopHtlcError('INVALID_PARAMS', 'FLOP_RPC_URL is required for FLOP_RAIL=flop-htlc')
      this.htlcPromise = import('./flop-htlc-polkadot.js').then(({ createPolkadotFlopHtlcClient }) =>
        createPolkadotFlopHtlcClient({
          rpcUrl,
          chainId: this.chainId,
          signingUri: flopSigningUri(),
          expectedGenesisHash: flopExpectedGenesisHash(),
        }),
      )
    }
    return this.htlcPromise
  }

  private index(hold: Hold): void {
    this.holds.set(hold.id, hold)
    this.holds.set(hold.ref, hold)
    this.holds.set(`flop-tclk:${hold.ref}`, hold)
    this.holds.set(`flop-tclk:${hold.id}`, hold)
  }

  private lookup(escrow: EscrowRef): Hold {
    const keys = [escrow.id, escrow.ref]
    for (const key of keys) {
      if (!key) continue
      const hit = this.holds.get(key) ?? this.holds.get(key.replace(/^flop-tclk:/, ''))
      if (hit) return hit
    }
    throw new Error('Unknown FLOP/tclk escrow')
  }

  private remoteStatus(record: EscrowRecord | null | undefined): FlopHtlcStatus | undefined {
    if (!record) return undefined
    if (record.status === 'Open') return 'locked'
    if (record.status === 'Released') return 'claimed'
    return 'refunded'
  }

  /** Test helper: tclk MemoryRail or live escrow status. */
  htlcStatus(escrow: EscrowRef): FlopHtlcStatus | undefined {
    if (this.remote) return undefined
    const hold = this.lookup(escrow)
    return this.memory.status(hold.ref)
  }

  async remoteHtlcStatus(escrow: EscrowRef): Promise<FlopHtlcStatus | undefined> {
    if (!this.remote) return this.htlcStatus(escrow)
    const hold = this.holds.get(escrow.id) ?? (escrow.ref ? this.holds.get(escrow.ref) : undefined)
    const id = hold?.ref.replace(/^flop-htlc:/, '') || escrow.ref?.replace(/^flop-htlc:/, '') || escrow.id
    const client = await this.htlc()
    return this.remoteStatus(await client.getEscrow(id))
  }

  /** Test helper: take the locally retained preimage (never an API surface). */
  takeTestPreimage(escrow: EscrowRef): string {
    const hold = this.lookup(escrow)
    const secret = this.testPreimages.get(hold.id)
    if (!secret) throw new Error('No test preimage retained for this escrow')
    this.testPreimages.delete(hold.id)
    return secret
  }

  /** Apply a client-held reveal against the memory rail or live satisfyEscrow. */
  async reveal(escrow: EscrowRef, preimage: string): Promise<{ txRef: string }> {
    if (this.remote) {
      const hold = this.lookup(escrow)
      const client = await this.htlc()
      const out = await client.claim(hold.ref, preimage)
      hold.remaining = 0n
      return { txRef: out.txHash }
    }
    const hold = this.lookup(escrow)
    await this.memory.claim(hold.ref, preimage)
    hold.remaining = 0n
    return { txRef: `flop-reveal:${this.clock()}:${hold.id}` }
  }

  async fund(ctx: SettlementContext, req: FundRequest) {
    rejectCustodialSecrets(req)
    if (this.remote) return this.fundRemote(ctx, req)
    const hashLock = generateHashLock()
    const now = this.clock()
    const refundAfterMs = now + DEFAULT_REFUND_WINDOW_MS
    const terms: LockTerms = {
      contract: contractId(),
      lock: 'hash',
      statement: hashLock.hash,
      amount: req.amount.toString(),
      asset: ctx.asset,
      payer: (req.from || '').trim() || 'payer',
      payee: 'payee',
      claimByMs: now + DEFAULT_REFUND_WINDOW_MS - DEFAULT_CLAIM_LEAD_MS,
      refundAfterMs,
    }
    const ref = await this.memory.lock(terms)
    const id = randomBytes(8).toString('hex')
    this.index({ id, ref, terms, remaining: req.amount })
    if (this.retainPreimageForTests) this.testPreimages.set(id, hashLock.preimage)
    return {
      escrow: { id, rail: this.name, ref: `flop-tclk:${ref}` } satisfies EscrowRef,
      txRef: `flop-fund:${now}:${id}`,
      unsigned: {
        kind: 'tclk:lock' as const,
        rail: 'memory' as const,
        chainId: this.chainId,
        contract: terms.contract,
        statement: terms.statement,
        refundAfterMs: terms.refundAfterMs,
        // Hash is public; preimage is not included.
      },
    }
  }

  private async fundRemote(ctx: SettlementContext, req: FundRequest) {
    this.assertRemoteReady()
    const payee = (req.to || req.from || '').trim()
    if (!payee) throw new FlopHtlcError('MISSING_PAYEE', 'flop-htlc fund requires a payee SS58 (FundRequest.to)')
    const hashLock = generateHashLock()
    const now = this.clock()
    const deadlineBlocks = Math.max(1, Math.ceil(DEFAULT_REFUND_WINDOW_MS / 1000))
    const client = await this.htlc()
    const opened = await client.lock({
      payee,
      amount: req.amount,
      hashLock: hashLock.hash,
      deadlineBlocks,
    })
    const id = randomBytes(8).toString('hex')
    const ref = opened.escrowId || `pending:${id}`
    const terms: LockTerms = {
      contract: contractId(),
      lock: 'hash',
      statement: hashLock.hash,
      amount: req.amount.toString(),
      asset: ctx.asset,
      payer: (req.from || '').trim() || 'payer',
      payee,
      claimByMs: now + DEFAULT_REFUND_WINDOW_MS - DEFAULT_CLAIM_LEAD_MS,
      refundAfterMs: now + DEFAULT_REFUND_WINDOW_MS,
    }
    this.index({ id, ref, terms, remaining: req.amount })
    if (this.retainPreimageForTests) this.testPreimages.set(id, hashLock.preimage)
    return {
      escrow: { id, rail: this.name, ref: `flop-htlc:${ref}` } satisfies EscrowRef,
      txRef: opened.txHash,
      unsigned: opened.unsigned,
    }
  }

  async lock(ctx: SettlementContext, escrow: EscrowRef) {
    rejectCustodialSecrets(escrow)
    if (this.remote) {
      const hold = this.lookup(escrow)
      if (hold.ref.startsWith('pending:')) return { ok: false }
      const client = await this.htlc()
      const record = await client.getEscrow(hold.ref)
      const ok = record?.status === 'Open'
      return { ok, txRef: ok ? `flop-lock:${this.clock()}:${hold.id}` : undefined }
    }
    const hold = this.lookup(escrow)
    const ok = await this.memory.verifyLock(hold.terms, hold.ref)
    return { ok, txRef: ok ? `flop-lock:${this.clock()}:${hold.id}` : undefined }
  }

  async verifyFunding(_ctx: SettlementContext, escrow: EscrowRef) {
    rejectCustodialSecrets(escrow)
    if (this.remote) {
      const hold = this.lookup(escrow)
      if (hold.ref.startsWith('pending:')) {
        return { ok: false, detail: `flop-htlc:pending:statement:${hold.terms.statement}:remaining:${hold.remaining.toString()}` }
      }
      const client = await this.htlc()
      const record = await client.getEscrow(hold.ref)
      const ok = record?.status === 'Open'
      return {
        ok: Boolean(ok),
        detail: `flop-htlc:${record?.status ?? 'missing'}:statement:${hold.terms.statement}:remaining:${hold.remaining.toString()}`,
      }
    }
    const hold = this.lookup(escrow)
    const ok = await this.memory.verifyLock(hold.terms, hold.ref)
    const status = this.memory.status(hold.ref)
    return {
      ok,
      detail: `flop-tclk:${status ?? 'missing'}:statement:${hold.terms.statement}:remaining:${hold.remaining.toString()}`,
    }
  }

  async release(_ctx: SettlementContext, escrow: EscrowRef, req: ReleaseRequest) {
    rejectCustodialSecrets(req)
    rejectCustodialSecrets(escrow)
    if (this.remote) {
      const hold = this.lookup(escrow)
      if (hold.remaining < req.amount) throw new Error('Insufficient FLOP/tclk escrow remaining')
      const client = await this.htlc()
      return { unsigned: client.unsignedSatisfy(hold.ref) }
    }
    const hold = this.lookup(escrow)
    if (hold.remaining < req.amount) throw new Error('Insufficient FLOP/tclk escrow remaining')
    return {
      unsigned: {
        kind: 'tclk:reveal' as const,
        rail: 'memory' as const,
        chainId: this.chainId,
        ref: hold.ref,
        contract: hold.terms.contract,
        statement: hold.terms.statement,
        to: req.to,
        amount: req.amount.toString(),
        from: req.from,
        note: 'Client-held preimage: call reveal locally. Never POST the preimage to the API.',
      },
    }
  }

  async refund(_ctx: SettlementContext, escrow: EscrowRef, req: RefundRequest) {
    rejectCustodialSecrets(req)
    rejectCustodialSecrets(escrow)
    if (this.remote) {
      const hold = this.lookup(escrow)
      const client = await this.htlc()
      const call = client.buildRefund(hold.ref)
      if (!client.canSign) {
        return { unsigned: client.unsigned(call) }
      }
      const out = await client.refund(hold.ref)
      const leftover = hold.remaining
      hold.remaining = 0n
      return { txRef: `${out.txHash}:${req.to}:${leftover.toString()}` }
    }
    const hold = this.lookup(escrow)
    await this.memory.refund(hold.ref)
    const leftover = hold.remaining
    hold.remaining = 0n
    return { txRef: `flop-refund:${this.clock()}:${hold.id}:${req.to}:${leftover.toString()}` }
  }

  connectionHint(): {
    rpcUrl: string | null
    chainId: string
    mode: 'memory' | 'flop-htlc'
    genesisHash?: string
  } {
    return {
      rpcUrl: this.rpcUrl,
      chainId: this.chainId,
      mode: this.remote ? 'flop-htlc' : 'memory',
      genesisHash: this.remote ? FLOP_DEVNET_GENESIS_HASH : undefined,
    }
  }
}

let shared: FlopTclkSettlementRail | undefined

/** Process-wide rail so HTTP fund → payout shares MemoryRail state. */
export function sharedFlopRail(opts?: FlopTclkRailOptions): FlopTclkSettlementRail {
  shared ??= new FlopTclkSettlementRail(opts)
  return shared
}

export function resetSharedFlopRail(): void {
  shared = undefined
}
