import { Connection, type BlockhashWithExpiryBlockHeight } from '@solana/web3.js'
import { OnlinePumpSdk, PumpSdk } from '@pump-fun/pump-sdk'
import { RPC_FAILOVER, RPC_URL } from '../config'
import { formatRpcError, isRpcForbidden } from './rpc-errors'

export { formatRpcError, isRpcForbidden } from './rpc-errors'

let connection: Connection | null = null
let onlineSdk: OnlinePumpSdk | null = null
let offlineSdk: PumpSdk | null = null
let activeRpc = RPC_URL
let failoverIndex = Math.max(0, RPC_FAILOVER.indexOf(RPC_URL))

function makeConnection(endpoint: string): Connection {
  return new Connection(endpoint, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 90_000,
  })
}

export function getActiveRpcUrl(): string {
  return activeRpc
}

export function getConnection(): Connection {
  if (!connection) {
    connection = makeConnection(activeRpc)
  }
  return connection
}

/** Swap to a different RPC and drop cached SDK/connection. */
export function switchRpc(endpoint: string): Connection {
  activeRpc = endpoint
  const idx = RPC_FAILOVER.indexOf(endpoint)
  if (idx >= 0) failoverIndex = idx
  connection = makeConnection(endpoint)
  onlineSdk = null
  return connection
}

export function getOnlineSdk(): OnlinePumpSdk {
  if (!onlineSdk) onlineSdk = new OnlinePumpSdk(getConnection())
  return onlineSdk
}

export function getPumpSdk(): PumpSdk {
  if (!offlineSdk) offlineSdk = new PumpSdk()
  return offlineSdk
}

/**
 * Fetch a recent blockhash, rotating public RPCs on 403/429.
 * Official mainnet RPC often forbids browser / GH Pages traffic.
 */
export async function getLatestBlockhashSafe(
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed',
): Promise<BlockhashWithExpiryBlockHeight> {
  const start = Math.max(0, failoverIndex)
  const order = [
    ...RPC_FAILOVER.slice(start),
    ...RPC_FAILOVER.slice(0, start),
  ]
  let lastErr: unknown

  for (const endpoint of order) {
    try {
      if (endpoint !== activeRpc) switchRpc(endpoint)
      const conn = getConnection()
      const result = await conn.getLatestBlockhash(commitment)
      failoverIndex = RPC_FAILOVER.indexOf(endpoint)
      return result
    } catch (err) {
      lastErr = err
      console.warn('RPC getLatestBlockhash failed', endpoint, err)
      if (!isRpcForbidden(err)) break
    }
  }

  throw new Error(formatRpcError(lastErr))
}
