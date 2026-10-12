import { randomBytes } from 'node:crypto'
import { generateHashLock, MemoryRail, type LockTerms } from '@flop-labs/tclk'
import { flopChainId, flopRailMode, flopRpcUrl, rejectCustodialSecrets } from './flop-config.js'
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
}

const DEFAULT_REFUND_WINDOW_MS = 24 * 60 * 60_000
const DEFAULT_CLAIM_LEAD_MS = 60 * 60_000

function contractId(): string {
  return `0x${randomBytes(32).toString('hex')}`
}

/**
 * CrewPay SettlementRail mapped onto tclk's HTLC memory rail.
 *
 *   fund           → MemoryRail.lock          (hash-lock created)
 *   lock           → MemoryRail.verifyLock
 *   verifyFunding  → MemoryRail.verifyLock
 *   release        → unsigned tclk:reveal     (claim is client-held preimage)
 *   refund         → MemoryRail.refund        (only at/after refundAfterMs)
 *
 * Job accept / submit / verify stay off-rail in the jobs store and HTTP routes.
 *
 * Non-custodial: the API never accepts private keys or preimages. When
 * FLOP_RPC_URL / FLOP_CHAIN_ID point at a live testnet, fund/release/refund
 * will return unsigned payloads for the flop-htlc binding (not published yet).
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

  constructor(opts?: FlopTclkRailOptions) {
    this.clock = opts?.clock ?? Date.now
    this.memory = new MemoryRail('memory', this.clock)
    this.rpcUrl = flopRpcUrl()
    this.chainId = flopChainId()
    this.remote = !opts?.forceMemory && flopRailMode() === 'flop-htlc'
    if (opts?.retainPreimageForTests) {
      // Flag is read by fund(); stored as a field via WeakMap-like convention below.
      this.retainPreimageForTests = true
    }
  }

  private retainPreimageForTests = false

  private assertMemory(): void {
    if (!this.remote) return
    throw new Error(
      'flop-htlc binding is not published yet. Unset FLOP_RPC_URL and FLOP_RAIL (or set FLOP_RAIL=memory) to use the tclk memory rail.',
    )
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

  /** Test helper: tclk MemoryRail status for an escrow. */
  htlcStatus(escrow: EscrowRef): FlopHtlcStatus | undefined {
    const hold = this.lookup(escrow)
    return this.memory.status(hold.ref)
  }

  /** Test helper: take the locally retained preimage (never an API surface). */
  takeTestPreimage(escrow: EscrowRef): string {
    const hold = this.lookup(escrow)
    const secret = this.testPreimages.get(hold.id)
    if (!secret) throw new Error('No test preimage retained for this escrow')
    this.testPreimages.delete(hold.id)
    return secret
  }

  /** Apply a client-held reveal against the memory rail (tests / local harness). */
  async reveal(escrow: EscrowRef, preimage: string): Promise<{ txRef: string }> {
    this.assertMemory()
    const hold = this.lookup(escrow)
    await this.memory.claim(hold.ref, preimage)
    hold.remaining = 0n
    return { txRef: `flop-reveal:${this.clock()}:${hold.id}` }
  }

  async fund(ctx: SettlementContext, req: FundRequest) {
    rejectCustodialSecrets(req)
    this.assertMemory()
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

  async lock(ctx: SettlementContext, escrow: EscrowRef) {
    rejectCustodialSecrets(escrow)
    this.assertMemory()
    const hold = this.lookup(escrow)
    const ok = await this.memory.verifyLock(hold.terms, hold.ref)
    return { ok, txRef: ok ? `flop-lock:${this.clock()}:${hold.id}` : undefined }
  }

  async verifyFunding(_ctx: SettlementContext, escrow: EscrowRef) {
    rejectCustodialSecrets(escrow)
    this.assertMemory()
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
    this.assertMemory()
    const hold = this.lookup(escrow)
    if (hold.remaining < req.amount) throw new Error('Insufficient FLOP/tclk escrow remaining')
    // Non-custodial: do not claim here. Caller holds the preimage and calls reveal()
    // locally, or (once flop-htlc exists) signs the unsigned payload.
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
    this.assertMemory()
    const hold = this.lookup(escrow)
    await this.memory.refund(hold.ref)
    const leftover = hold.remaining
    hold.remaining = 0n
    return { txRef: `flop-refund:${this.clock()}:${hold.id}:${req.to}:${leftover.toString()}` }
  }

  /** Reserved: future flop-htlc client will use FLOP_RPC_URL + FLOP_CHAIN_ID. */
  connectionHint(): { rpcUrl: string | null; chainId: string; mode: 'memory' | 'flop-htlc' } {
    return { rpcUrl: this.rpcUrl, chainId: this.chainId, mode: this.remote ? 'flop-htlc' : 'memory' }
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
