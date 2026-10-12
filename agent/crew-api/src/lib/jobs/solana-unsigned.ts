import { PublicKey, SystemProgram, TransactionMessage } from '@solana/web3.js'
import { getConnection } from '../agent/send.js'

export async function buildUnsignedSolanaTransfer(opts: {
  from: string
  to: string
  lamports: bigint
}) {
  const connection = getConnection()
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const from = new PublicKey(opts.from)
  const to = new PublicKey(opts.to)
  const ix = SystemProgram.transfer({
    fromPubkey: from,
    toPubkey: to,
    lamports: Number(opts.lamports),
  })
  const msg = new TransactionMessage({
    payerKey: from,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message()
  return {
    kind: 'solana:transfer' as const,
    messageBase64: Buffer.from(msg.serialize()).toString('base64'),
    recentBlockhash: blockhash,
    lastValidBlockHeight,
    requiredSigners: [from.toBase58()],
    v: 0,
  }
}

