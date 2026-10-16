import { Transaction } from '@mysten/sui/transactions'
import { toBase64 } from '@mysten/sui/utils'
import { assertSuiAddress } from './sui-address.js'
import type { UnsignedStep } from './unsigned.js'
import { suiRpcUrl } from './platforms.js'
import { SuiClient } from '@mysten/sui/client'

let clientOverride: SuiClient | null = null

export function setSuiClientForTests(client: SuiClient | null): void {
  clientOverride = client
}

export function getSuiClient(): SuiClient {
  if (clientOverride) return clientOverride
  return new SuiClient({ url: suiRpcUrl() })
}

export async function suiTxStep(
  kind: UnsignedStep['kind'],
  tx: Transaction,
  signer: string,
  note?: string,
): Promise<UnsignedStep> {
  const launcher = assertSuiAddress(signer, 'launcherPubkey')
  tx.setSender(launcher)
  const client = getSuiClient()
  const built = await tx.build({ client, onlyTransactionKind: true })
  const b64 = toBase64(built)
  return {
    kind,
    messageBase64: b64,
    transactionBase64: b64,
    recentBlockhash: '',
    lastValidBlockHeight: 0,
    requiredSigners: [launcher],
    v: 0,
    encoding: 'sui-tx',
    note,
  }
}
