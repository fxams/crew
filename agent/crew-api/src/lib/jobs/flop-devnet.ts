/**
 * Published FLOP public-devnet identity.
 *
 * Values were read 2026-11-03 (UTC) from the public RPC and independently
 * confirmed by the public faucet `/chain` document. This is a community
 * pin for a disposable network that may reset — a mismatch must fail closed.
 */

export const FLOP_DEVNET_CHAIN_ID = 'flop-devnet'

/** `chain_getBlockHash(0)` and faucet `/chain` genesisHash. */
export const FLOP_DEVNET_GENESIS_HASH =
  '0x99c172c095340ace980631f9123544c6bebd4839f3437e463533422d8be2d631'

export const FLOP_DEVNET_RPC_URL = 'https://rpc.devnet.flop.network'
export const FLOP_DEVNET_WSS_URL = 'wss://rpc.devnet.flop.network'
export const FLOP_DEVNET_FAUCET_URL = 'https://faucet.flop.network'

export const FLOP_SS58_FORMAT = 42
export const FLOP_DECIMALS = 18
export const FLOP_TOKEN_SYMBOL = 'FLOP'

/** Runtime observed on the public RPC at pin time (informational). */
export const FLOP_DEVNET_SPEC_NAME = 'tzkv-runtime'

export const HAS_STATION_PALLET = 'hasStation'

/** Job escrow extrinsics on `pallet_has_station` (live metadata). */
export const HAS_STATION_EXTRINSICS = {
  openEscrow: 'openEscrow',
  satisfyEscrow: 'satisfyEscrow',
  approveEscrow: 'approveEscrow',
  refundEscrow: 'refundEscrow',
} as const

/** Custom RPC methods advertised by `rpc_methods` on the public RPC. */
export const HAS_STATION_RPC = {
  checkHtlcStatus: 'hasStation_checkHTLCStatus',
  getHtlcByHashLock: 'hasStation_getHtlcByHashLock',
} as const

export function normalizeHex(value: string): string {
  const v = value.trim().toLowerCase()
  return v.startsWith('0x') ? v : `0x${v}`
}

export function isFlopDevnetChainId(chainId: string | undefined): boolean {
  return (chainId || '').trim().toLowerCase() === FLOP_DEVNET_CHAIN_ID
}

export function assertHex32(name: string, value: string): string {
  const hex = normalizeHex(value)
  if (!/^0x[0-9a-f]{64}$/.test(hex)) {
    throw new Error(`${name} must be a 32-byte hex string`)
  }
  return hex
}

/** JSON-RPC reads use HTTP(S). Signed submit needs a subscription (WS/WSS). */
export function toHttpRpcUrl(url: string): string {
  const u = url.trim()
  if (u.startsWith('wss://')) return `https://${u.slice('wss://'.length)}`
  if (u.startsWith('ws://')) return `http://${u.slice('ws://'.length)}`
  return u
}

/** HttpProvider cannot watch in-block status; rewrite https → wss for submit. */
export function toWsRpcUrl(url: string): string {
  const u = url.trim()
  if (u.startsWith('https://')) return `wss://${u.slice('https://'.length)}`
  if (u.startsWith('http://')) return `ws://${u.slice('http://'.length)}`
  return u
}
