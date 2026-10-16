import { SuiClient } from '@mysten/sui/client'
import { Network } from '@interest-protocol/sui-core-sdk'
import {
  CONFIG_KEYS,
  MIGRATOR_WITNESSES,
  MemezPumpSDK,
  PACKAGES,
  SHARED_OBJECTS,
} from '@interest-protocol/memez-fun-sdk'
import { suiNetwork, suiRpcUrl } from './platforms.js'

export type MemezPumpSdk = MemezPumpSDK

let pumpSdkOverride: MemezPumpSdk | null = null

export function setMemezPumpSdkForTests(sdk: MemezPumpSdk | null): void {
  pumpSdkOverride = sdk
}

/**
 * npm @interest-protocol/memez-fun-sdk asserts mainnet in the constructor even though
 * package constants include testnet — construct on mainnet then repoint to testnet.
 */
export function createMemezPumpSdk(): MemezPumpSdk {
  if (pumpSdkOverride) return pumpSdkOverride
  const net = suiNetwork()
  if (net !== 'testnet') {
    throw new Error('Memez pump SDK is only wired for Sui testnet in this release.')
  }
  const fullNodeUrl = suiRpcUrl()
  const sdk = new MemezPumpSDK({
    network: Network.MAINNET,
    fullNodeUrl: 'https://fullnode.mainnet.sui.io:443',
  })
  sdk.network = Network.TESTNET
  sdk.packages = PACKAGES[Network.TESTNET]
  sdk.sharedObjects = SHARED_OBJECTS[Network.TESTNET]
  sdk.rpcUrl = fullNodeUrl
  // Memez SDK types pin CJS @mysten/sui client; runtime client is compatible.
  sdk.client = new SuiClient({ url: fullNodeUrl }) as unknown as MemezPumpSdk['client']
  sdk.memezOTW = `${PACKAGES[Network.TESTNET].MEMEZ.original}::memez::MEMEZ`
  return sdk
}

export function defaultMemezConfigurationKey(customKey?: string): string {
  const key = (customKey || process.env.MEMEZ_CONFIG_KEY || '').trim()
  if (key) return key
  return CONFIG_KEYS.testnet.XPUMP
}

export function defaultTestnetMigratorWitness(): string {
  return MIGRATOR_WITNESSES.testnet.TEST
}
