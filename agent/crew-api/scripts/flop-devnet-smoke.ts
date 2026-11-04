/**
 * Read-only FLOP public-devnet identity check.
 *
 * No signing key, no faucet call, no funds. Safe to run without secrets.
 * Exits non-zero if the live genesis does not match the community pin.
 */
import {
  FLOP_DEVNET_CHAIN_ID,
  FLOP_DEVNET_FAUCET_URL,
  FLOP_DEVNET_GENESIS_HASH,
  FLOP_DEVNET_RPC_URL,
} from '../src/lib/jobs/flop-devnet.js'
import { FlopJsonRpc } from '../src/lib/jobs/flop-htlc-rpc.js'

async function main(): Promise<void> {
  const rpcUrl = (process.env.FLOP_RPC_URL || '').trim() || FLOP_DEVNET_RPC_URL
  const rpc = new FlopJsonRpc({ rpcUrl, chainId: FLOP_DEVNET_CHAIN_ID })
  const identity = await rpc.assertIdentity()
  const health = await rpc.call<{ isSyncing?: boolean; peers?: number }>('system_health')
  const dummy = `0x${'11'.repeat(32)}`
  const htlc = await rpc.checkHtlcStatus(dummy)
  const faucet = await fetch(`${FLOP_DEVNET_FAUCET_URL.replace(/\/$/, '')}/chain`).then((r) => r.json()) as {
    genesisHash?: string
    network?: string
    rpc?: string
  }

  const lines = [
    `chain=${identity.chain}`,
    `spec=${identity.specName}@${identity.specVersion}`,
    `genesis=${identity.genesisHash}`,
    `pin=${FLOP_DEVNET_GENESIS_HASH}`,
    `ss58=${identity.ss58Format} token=${identity.tokenSymbol} decimals=${identity.tokenDecimals}`,
    `peers=${health.peers ?? '?'} syncing=${health.isSyncing ?? '?'}`,
    `checkHTLCStatus(dummy)=${htlc == null ? 'null (HTLC not found)' : 'unexpected hit'}`,
    `faucet.network=${faucet.network ?? '?'} faucet.genesis=${faucet.genesisHash ?? '?'}`,
    `faucet.rpc=${faucet.rpc ?? '?'}`,
  ]
  if (faucet.genesisHash && faucet.genesisHash.toLowerCase() !== FLOP_DEVNET_GENESIS_HASH) {
    throw new Error(`Faucet /chain genesis ${faucet.genesisHash} does not match pin`)
  }
  if (htlc != null) {
    throw new Error('Dummy hash_lock unexpectedly resolved to an HTLC')
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`${msg}\n`)
  process.exitCode = 1
})
