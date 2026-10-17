import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { readPlatformBuybackWallet } from '../agent/constants.js'
import { getConnection } from '../agent/send.js'
import type { PoolAllocationRow } from './pool-allocations.js'

const BASE_CHAIN_ID = 8453

export type UnsignedPoolPayouts = {
  solana: { from: string; transactionBase64: string; note: string } | null
  base: Array<{
    from: string
    to: string
    valueWei: string
    unsigned: { chainId: number; from: string; to: string; value: string; gas: string }
  }>
}

function hexWei(n: bigint): string {
  return `0x${n.toString(16)}`
}

export async function buildUnsignedPoolPayouts(allocations: PoolAllocationRow[]): Promise<UnsignedPoolPayouts> {
  const solFrom = readPlatformBuybackWallet()
  const evmFrom = (
    process.env.CLANKER_TREASURY_ADDRESS ||
    process.env.ZORA_TREASURY_ADDRESS ||
    process.env.CREW_BUYBACK_WALLET_EVM ||
    ''
  ).trim()

  const solPayouts = allocations.filter(
    (a) => a.solanaWallet && BigInt(a.solanaLamports) > 0n,
  )
  let solana: UnsignedPoolPayouts['solana'] = null
  if (solPayouts.length && solFrom.length >= 32) {
    const conn = getConnection()
    const { blockhash } = await conn.getLatestBlockhash('finalized')
    const tx = new Transaction()
    for (const row of solPayouts) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(solFrom),
          toPubkey: new PublicKey(row.solanaWallet!),
          lamports: BigInt(row.solanaLamports),
        }),
      )
    }
    tx.recentBlockhash = blockhash
    tx.feePayer = new PublicKey(solFrom)
    solana = {
      from: solFrom,
      transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
      note: 'Sign with the Solana treasury wallet (fee payer). Re-fetch blockhash if stale before broadcast.',
    }
  }

  const basePayouts: UnsignedPoolPayouts['base'] = []
  if (evmFrom.startsWith('0x')) {
    for (const row of allocations) {
      if (!row.evmWallet || BigInt(row.baseWei) <= 0n) continue
      const value = BigInt(row.baseWei)
      basePayouts.push({
        from: evmFrom,
        to: row.evmWallet,
        valueWei: row.baseWei,
        unsigned: {
          chainId: BASE_CHAIN_ID,
          from: evmFrom,
          to: row.evmWallet,
          value: hexWei(value),
          gas: '0x5208',
        },
      })
    }
  }

  return { solana, base: basePayouts }
}
