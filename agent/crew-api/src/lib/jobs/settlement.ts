import { randomBytes } from 'node:crypto'
import { nowMs } from './types.js'

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
}

export type RefundRequest = {
  to: string
}

export interface SettlementRail {
  name: string
  fund(ctx: SettlementContext, req: FundRequest): Promise<{ escrow: EscrowRef; txRef?: string }>
  lock(ctx: SettlementContext, escrow: EscrowRef): Promise<{ ok: boolean; txRef?: string }>
  verifyFunding(ctx: SettlementContext, escrow: EscrowRef): Promise<{ ok: boolean; detail?: string }>
  release(ctx: SettlementContext, escrow: EscrowRef, req: ReleaseRequest): Promise<{ txRef?: string }>
  refund(ctx: SettlementContext, escrow: EscrowRef, req: RefundRequest): Promise<{ txRef?: string }>
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

// Solana devnet stub — no real transaction; future: program PDA + Anchor/SDK on devnet.
export class SolanaDevnetSettlementRail implements SettlementRail {
  public name = 'solana-devnet'
  private balances = new Map<string, bigint>()

  async fund(_ctx: SettlementContext, req: FundRequest) {
    const id = randomBytes(8).toString('hex')
    this.balances.set(id, req.amount)
    // In a real impl, create a PDA escrow account and transfer lamports/USDC-dev to it.
    return { escrow: { id, rail: this.name, ref: `sol-devnet:${id}` }, txRef: `devnet-fund:${nowMs()}:${id}` }
  }

  async lock(_ctx: SettlementContext, _escrow: EscrowRef) {
    // Could mark PDA as locked; here a no-op.
    return { ok: true, txRef: `devnet-lock:${nowMs()}` }
  }

  async verifyFunding(_ctx: SettlementContext, escrow: EscrowRef) {
    const bal = this.balances.get(escrow.id) ?? 0n
    return { ok: bal > 0n, detail: `devnet-bal:${bal.toString()}` }
  }

  async release(_ctx: SettlementContext, escrow: EscrowRef, req: ReleaseRequest) {
    const bal = this.balances.get(escrow.id) ?? 0n
    if (bal < req.amount) throw new Error('Insufficient escrow balance (devnet-stub)')
    this.balances.set(escrow.id, bal - req.amount)
    return { txRef: `devnet-release:${nowMs()}:${escrow.id}:${req.to}:${req.amount.toString()}` }
  }

  async refund(_ctx: SettlementContext, escrow: EscrowRef, req: RefundRequest) {
    const bal = this.balances.get(escrow.id) ?? 0n
    this.balances.set(escrow.id, 0n)
    return { txRef: `devnet-refund:${nowMs()}:${escrow.id}:${req.to}:${bal.toString()}` }
  }
}

export function railFor(chainId: string | undefined, preferred?: string): SettlementRail {
  const name = (preferred || '').trim().toLowerCase()
  if (name === 'solana-devnet') return new SolanaDevnetSettlementRail()
  if (name === 'sim') return new SimulatedSettlementRail()
  // Default per chainId: devnet stub for solana-devnet; sim elsewhere
  if (chainId === 'solana-devnet') return new SolanaDevnetSettlementRail()
  return new SimulatedSettlementRail()
}

