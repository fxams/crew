import { FLOP_DEVNET_CHAIN_ID, HAS_STATION_EXTRINSICS, HAS_STATION_PALLET, normalizeHex } from './flop-devnet.js'
import { FlopHtlcError } from './flop-htlc-errors.js'
import type { FlopNetworkIdentity } from './flop-htlc-rpc.js'

export type EscrowStatus = 'Open' | 'Released' | 'Refunded'
export type HtlcLifecycle = 'Created' | 'Settled' | 'Refunded' | 'Committed'

export type ChainPredicate =
  | { Hash: string }
  | { Sig: string }
  | { Before: number }
  | { After: number }
  | { Point: string }

export type ChainCombinator = { And: null } | { Or: null } | { Threshold: number }

export type ChainPolicy = {
  combinator: ChainCombinator
  clauses: ChainPredicate[]
}

export type EscrowRecord = {
  id: string
  funder: string
  payee: string
  amount: bigint
  policy: ChainPolicy
  deadline: number
  status: EscrowStatus
  createdBlock: number
}

export type HtlcRecord = {
  htlcId?: string
  hashLock: string
  status: HtlcLifecycle | string
  rewardAmount?: bigint
  timeoutBlock?: number
  raw?: unknown
}

export type FlopHtlcCall =
  | {
      pallet: typeof HAS_STATION_PALLET
      method: typeof HAS_STATION_EXTRINSICS.openEscrow
      payee: string
      amount: bigint
      policy: ChainPolicy
      deadlineBlocks: number
    }
  | {
      pallet: typeof HAS_STATION_PALLET
      method: typeof HAS_STATION_EXTRINSICS.satisfyEscrow
      escrowId: string
      preimages: string[]
    }
  | {
      pallet: typeof HAS_STATION_PALLET
      method: typeof HAS_STATION_EXTRINSICS.approveEscrow
      escrowId: string
    }
  | {
      pallet: typeof HAS_STATION_PALLET
      method: typeof HAS_STATION_EXTRINSICS.refundEscrow
      escrowId: string
    }

export type SubmitResult = {
  txHash: string
  escrowId?: string
}

export interface FlopChainIo {
  rpcUrl: string
  chainId: string
  canSign: boolean
  assertIdentity(): Promise<FlopNetworkIdentity>
  getEscrow(id: string): Promise<EscrowRecord | null>
  checkHtlcStatus(hashLock: string): Promise<HtlcRecord | null>
  currentBlock(): Promise<number>
  submit(call: FlopHtlcCall): Promise<SubmitResult>
  disconnect(): Promise<void>
}

export type OpenEscrowParams = {
  payee: string
  amount: bigint
  hashLock: string
  deadlineBlocks: number
}

export type UnsignedFlopCall = {
  kind: 'flop-htlc:call'
  rail: 'flop-htlc'
  chainId: string
  pallet: string
  method: string
  args: Record<string, unknown>
  note: string
}

const UNSIGNED_NOTE =
  'Community flop-htlc adapter: sign locally with FLOP_SIGNING_URI. Never POST a signing key or hash-lock secret to the API.'

export function hashLockPolicy(hashLock: string): ChainPolicy {
  return {
    combinator: { And: null },
    clauses: [{ Hash: normalizeHex(hashLock) }],
  }
}

export function unsignedCall(chainId: string, call: FlopHtlcCall): UnsignedFlopCall {
  const { pallet, method, ...args } = call
  const safeArgs: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (k === 'preimages') {
      safeArgs.preimages = []
      continue
    }
    safeArgs[k] = typeof v === 'bigint' ? v.toString() : v
  }
  return {
    kind: 'flop-htlc:call',
    rail: 'flop-htlc',
    chainId,
    pallet,
    method,
    args: safeArgs,
    note: UNSIGNED_NOTE,
  }
}

export class FlopHtlcClient {
  constructor(private readonly io: FlopChainIo) {}

  get canSign(): boolean {
    return this.io.canSign
  }

  get chainId(): string {
    return this.io.chainId || FLOP_DEVNET_CHAIN_ID
  }

  get rpcUrl(): string {
    return this.io.rpcUrl
  }

  async assertIdentity(): Promise<FlopNetworkIdentity> {
    return this.io.assertIdentity()
  }

  buildOpenEscrow(params: OpenEscrowParams): FlopHtlcCall {
    const payee = (params.payee || '').trim()
    if (!payee) throw new FlopHtlcError('MISSING_PAYEE', 'openEscrow requires a payee SS58 address')
    if (params.amount <= 0n) throw new FlopHtlcError('INVALID_PARAMS', 'openEscrow amount must be > 0')
    if (!Number.isInteger(params.deadlineBlocks) || params.deadlineBlocks < 1) {
      throw new FlopHtlcError('INVALID_PARAMS', 'deadlineBlocks must be a positive integer (relative block count)')
    }
    return {
      pallet: HAS_STATION_PALLET,
      method: HAS_STATION_EXTRINSICS.openEscrow,
      payee,
      amount: params.amount,
      policy: hashLockPolicy(params.hashLock),
      deadlineBlocks: params.deadlineBlocks,
    }
  }

  buildSatisfy(escrowId: string, preimage: string): FlopHtlcCall {
    const id = normalizeHex(escrowId)
    const secret = normalizeHex(preimage)
    if (!/^0x[0-9a-f]+$/i.test(secret) || secret.length < 4) {
      throw new FlopHtlcError('INVALID_PARAMS', 'satisfyEscrow preimage must be hex')
    }
    return {
      pallet: HAS_STATION_PALLET,
      method: HAS_STATION_EXTRINSICS.satisfyEscrow,
      escrowId: id,
      preimages: [secret],
    }
  }

  buildRefund(escrowId: string): FlopHtlcCall {
    return {
      pallet: HAS_STATION_PALLET,
      method: HAS_STATION_EXTRINSICS.refundEscrow,
      escrowId: normalizeHex(escrowId),
    }
  }

  unsigned(call: FlopHtlcCall): UnsignedFlopCall {
    return unsignedCall(this.chainId, call)
  }

  unsignedSatisfy(escrowId: string): UnsignedFlopCall {
    return this.unsigned({
      pallet: HAS_STATION_PALLET,
      method: HAS_STATION_EXTRINSICS.satisfyEscrow,
      escrowId: normalizeHex(escrowId),
      preimages: [],
    })
  }

  async lock(params: OpenEscrowParams): Promise<{ unsigned: UnsignedFlopCall; txHash?: string; escrowId?: string }> {
    await this.io.assertIdentity()
    const call = this.buildOpenEscrow(params)
    const unsigned = this.unsigned(call)
    if (!this.io.canSign) return { unsigned }
    const submitted = await this.io.submit(call)
    return { ...submitted, unsigned }
  }

  async claim(escrowId: string, preimage: string): Promise<SubmitResult> {
    await this.io.assertIdentity()
    if (!this.io.canSign) {
      throw new FlopHtlcError('MISSING_SIGNER', 'FLOP_SIGNING_URI is required to submit satisfyEscrow')
    }
    const held = await this.io.getEscrow(escrowId)
    if (!held) throw new FlopHtlcError('ESCROW_NOT_FOUND', `Escrow ${escrowId} not found`)
    if (held.status !== 'Open') {
      throw new FlopHtlcError('ESCROW_NOT_OPEN', `Escrow ${escrowId} is ${held.status}, not Open`)
    }
    try {
      return await this.io.submit(this.buildSatisfy(escrowId, preimage))
    } catch (err) {
      throw remapSubmit(err, 'POLICY_NOT_SATISFIED', /policy|satisf/i)
    }
  }

  async refund(escrowId: string): Promise<SubmitResult> {
    await this.io.assertIdentity()
    if (!this.io.canSign) {
      throw new FlopHtlcError('MISSING_SIGNER', 'FLOP_SIGNING_URI is required to submit refundEscrow')
    }
    const held = await this.io.getEscrow(escrowId)
    if (!held) throw new FlopHtlcError('ESCROW_NOT_FOUND', `Escrow ${escrowId} not found`)
    if (held.status !== 'Open') {
      throw new FlopHtlcError('ESCROW_NOT_OPEN', `Escrow ${escrowId} is ${held.status}, not Open`)
    }
    const head = await this.io.currentBlock()
    if (head < held.deadline) {
      throw new FlopHtlcError(
        'REFUND_NOT_READY',
        `refundEscrow is funder-only after deadline block ${held.deadline} (head ${head})`,
      )
    }
    try {
      return await this.io.submit(this.buildRefund(escrowId))
    } catch (err) {
      throw remapSubmit(err, 'REFUND_NOT_READY', /deadline|timeout|refund/i)
    }
  }

  async getEscrow(id: string): Promise<EscrowRecord | null> {
    await this.io.assertIdentity()
    return this.io.getEscrow(id)
  }

  async checkHtlcStatus(hashLock: string): Promise<HtlcRecord | null> {
    await this.io.assertIdentity()
    return this.io.checkHtlcStatus(hashLock)
  }

  async disconnect(): Promise<void> {
    await this.io.disconnect()
  }
}

function remapSubmit(err: unknown, code: 'POLICY_NOT_SATISFIED' | 'REFUND_NOT_READY', re: RegExp): never {
  if (err instanceof FlopHtlcError) {
    if (re.test(err.message)) throw new FlopHtlcError(code, err.message, { cause: err })
    throw err
  }
  const msg = err instanceof Error ? err.message : String(err)
  if (re.test(msg)) throw new FlopHtlcError(code, msg, { cause: err })
  throw err
}
