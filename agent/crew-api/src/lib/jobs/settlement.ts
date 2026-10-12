import { randomBytes } from 'node:crypto'
import { nowMs } from './types.js'
import { buildUnsignedSolanaTransfer } from './solana-unsigned.js'

export type SettlementContext = {
  chainId: string
  asset: string
}

export type EscrowRef = {
  id: string
  rail: string
  // rail-specific reference (e.g., PDA, program id, or tx signature)
  ref?: string
}

export type FundRequest = {
  amount: bigint
  from?: string // agent funding wallet (optional in sim)
}

export type ReleaseRequest = {
  to: string
  amount: bigint
  /** For non-custodial rails, from address (payer) is required to build unsigned txs. */
  from?: string
}

export type RefundRequest = {
  to: string
  from?: string
}

export interface SettlementRail {
  name: string
  fund(ctx: SettlementContext, req: FundRequest): Promise<{ escrow: EscrowRef; txRef?: string; unsigned?: unknown }>
  lock(ctx: SettlementContext, escrow: EscrowRef): Promise<{ ok: boolean; txRef?: string; unsigned?: unknown }>
  verifyFunding(ctx: SettlementContext, escrow: EscrowRef): Promise<{ ok: boolean; detail?: string }>
  release(
    ctx: SettlementContext,
    escrow: EscrowRef,
    req: ReleaseRequest,
  ): Promise<{ txRef?: string; unsigned?: unknown }>
  refund(
    ctx: SettlementContext,
    escrow: EscrowRef,
    req: RefundRequest,
  ): Promise<{ txRef?: string; unsigned?: unknown }>
}

// Simulated in-memory ledger — amounts are not conserved globally (test-only).
export class SimulatedSettlementRail implements SettlementRail {
  public name = 'sim'
  private balances = new Map<string, bigint>() // escrowId → remaining

  async fund(_ctx: SettlementContext, req: FundRequest) {
    const id = randomBytes(8).toString('hex')
    this.balances.set(id, req.amount)
    return { escrow: { id, rail: this.name, ref: `sim:${id}` }, txRef: `sim-fund:${nowMs()}:${id}` }
  }

  async lock(_ctx: SettlementContext, _escrow: EscrowRef) {
    return { ok: true, txRef: `sim-lock:${nowMs()}` }
  }

  async verifyFunding(_ctx: SettlementContext, escrow: EscrowRef) {
    const bal = this.balances.get(escrow.id) ?? 0n
    return { ok: bal > 0n, detail: `sim-bal:${bal.toString()}` }
  }

  async release(_ctx: SettlementContext, escrow: EscrowRef, req: ReleaseRequest) {
    const bal = this.balances.get(escrow.id) ?? 0n
    if (bal < req.amount) throw new Error('Insufficient escrow balance (sim)')
    this.balances.set(escrow.id, bal - req.amount)
    return { txRef: `sim-release:${nowMs()}:${escrow.id}:${req.to}:${req.amount.toString()}` }
  }

  async refund(_ctx: SettlementContext, escrow: EscrowRef, req: RefundRequest) {
    const bal = this.balances.get(escrow.id) ?? 0n
    this.balances.set(escrow.id, 0n)
    return { txRef: `sim-refund:${nowMs()}:${escrow.id}:${req.to}:${bal.toString()}` }
  }
}

// Solana devnet non-custodial rail — builds unsigned transfers; does not custody keys.
export class SolanaDevnetSettlementRail implements SettlementRail {
  public name = 'solana-devnet'
  private holders = new Map<string, { from: string; budget: bigint }>()

  async fund(_ctx: SettlementContext, req: FundRequest) {
    // Non-custodial: treat `from` (creator wallet) as the escrow holder; no onchain move.
    const from = (req.from || '').trim()
    if (!from) throw new Error('from (creator wallet) is required for non-custodial devnet rail')
    const id = randomBytes(8).toString('hex')
    this.holders.set(id, { from, budget: req.amount })
    return { escrow: { id, rail: this.name, ref: `sol-devnet:${id}` } }
  }

  async lock(_ctx: SettlementContext, _escrow: EscrowRef) {
    return { ok: true, txRef: `devnet-lock:${nowMs()}` }
  }

  async verifyFunding(_ctx: SettlementContext, escrow: EscrowRef) {
    const h = this.holders.get(escrow.id)
    if (!h) return { ok: false, detail: 'unknown escrow holder' }
    // Optionally: query devnet balance of `h.from` via RPC to check >= budget. Skip if RPC unavailable.
    return { ok: true, detail: `holder:${h.from}:budget:${h.budget.toString()}` }
  }

  async release(_ctx: SettlementContext, escrow: EscrowRef, req: ReleaseRequest) {
    const h = this.holders.get(escrow.id)
    if (!h) throw new Error('Unknown escrow holder')
    if (!req.from || req.from !== h.from) throw new Error('from must match escrow holder')
    const unsigned = await buildUnsignedSolanaTransfer({
      from: req.from,
      to: req.to,
      lamports: req.amount,
    })
    return { unsigned }
  }

  async refund(_ctx: SettlementContext, escrow: EscrowRef, req: RefundRequest) {
    const h = this.holders.get(escrow.id)
    if (!h) throw new Error('Unknown escrow holder')
    if (!req.from || req.from !== h.from) throw new Error('from must match escrow holder')
    // Non-custodial: funds never moved; return a no-op hint.
    return { unsigned: { kind: 'noop', note: 'No escrow — funds remained in creator wallet' } }
  }
}

// EVM (Base Sepolia default) — produce an unsigned transfer transaction object.
export class EvmSepoliaSettlementRail implements SettlementRail {
  public name = 'evm:base-sepolia'
  async fund(_ctx: SettlementContext, _req: FundRequest) {
    // No-op for non-custodial EVM rail.
    return { escrow: { id: randomBytes(8).toString('hex'), rail: this.name } }
  }
  async lock() {
    return { ok: true }
  }
  async verifyFunding() {
    return { ok: true }
  }
  async release(_ctx: SettlementContext, _escrow: EscrowRef, req: ReleaseRequest) {
    if (!req.from) throw new Error('from is required for EVM unsigned release')
    const unsigned = {
      kind: 'evm:transfer',
      chain: 'base-sepolia',
      tx: {
        to: req.to,
        from: req.from,
        value: `0x${req.amount.toString(16)}`,
        data: '0x',
        gas: '0x5208', // 21000
      },
    }
    return { unsigned }
  }
  async refund(_ctx: SettlementContext, _escrow: EscrowRef, req: RefundRequest) {
    if (!req.from) throw new Error('from is required for EVM unsigned refund')
    return {
      unsigned: {
        kind: 'noop',
        note: 'No escrow — funds remained in creator wallet',
      },
    }
  }
}

export function railFor(chainId: string | undefined, preferred?: string): SettlementRail {
  const name = (preferred || '').trim().toLowerCase()
  if (name === 'solana-devnet') return new SolanaDevnetSettlementRail()
  if (name === 'sim') return new SimulatedSettlementRail()
  // Default per chainId: devnet stub for solana-devnet; sim elsewhere
  if (chainId === 'solana-devnet') return new SolanaDevnetSettlementRail()
  if (chainId?.startsWith('evm:base-sepolia')) return new EvmSepoliaSettlementRail()
  return new SimulatedSettlementRail()
}

