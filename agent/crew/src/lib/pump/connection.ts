import { Connection } from '@solana/web3.js'
import { OnlinePumpSdk, PumpSdk } from '@pump-fun/pump-sdk'
import { RPC_URL } from '../config'

let connection: Connection | null = null
let onlineSdk: OnlinePumpSdk | null = null
let offlineSdk: PumpSdk | null = null

export function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 90_000,
    })
  }
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
