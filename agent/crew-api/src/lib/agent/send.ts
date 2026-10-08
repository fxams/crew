import {
  Connection,
  Keypair,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js'
import bs58 from 'bs58'
import { rpcUrl } from './constants.js'

export function parseLauncherKey(raw: string): Keypair {
  const secret = raw.trim()
  if (!secret) throw new Error('Missing launcher key (x-launcher-key header).')
  try {
    return Keypair.fromSecretKey(bs58.decode(secret))
  } catch {
    try {
      const arr = JSON.parse(secret) as number[]
      return Keypair.fromSecretKey(Uint8Array.from(arr))
    } catch {
      throw new Error('Invalid x-launcher-key — use base58 secret or JSON byte array.')
    }
  }
}

export function getConnection(): Connection {
  return new Connection(rpcUrl(), {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 90_000,
  })
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function confirmSignature(connection: Connection, signature: string, timeoutMs = 90_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    })
    const status = value[0]
    if (status?.err) throw new Error(`Transaction failed on-chain: ${signature}`)
    if (
      status?.confirmationStatus === 'confirmed' ||
      status?.confirmationStatus === 'finalized'
    ) {
      return
    }
    await sleep(1_400)
  }
  throw new Error(`Confirmation timed out: https://solscan.io/tx/${signature}`)
}

export async function sendInstructions(opts: {
  payer: Keypair
  ixs: TransactionInstruction[]
  signers?: Keypair[]
  attempts?: number
}): Promise<string> {
  const { payer, ixs, signers = [], attempts = 2 } = opts
  const connection = getConnection()
  let lastErr: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
      const tx = new Transaction({
        feePayer: payer.publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(...ixs)
      tx.partialSign(payer, ...signers)
      const raw = tx.serialize()
      const signature = await connection.sendRawTransaction(raw, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      })
      await confirmSignature(connection, signature)
      return signature
    } catch (err) {
      lastErr = err
      if (attempt >= attempts) break
      await sleep(800)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('sendInstructions failed')
}
