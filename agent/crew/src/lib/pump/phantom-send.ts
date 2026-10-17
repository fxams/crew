import { Transaction } from '@solana/web3.js'
import type { Connection } from '@solana/web3.js'

type PhantomSolanaProvider = {
  signAndSendTransaction?: (
    transaction: Transaction,
    opts?: {
      skipPreflight?: boolean
      maxRetries?: number
      preflightCommitment?: string
    },
  ) => Promise<{ signature: string }>
  isPhantom?: boolean
}

function phantomSolana(): PhantomSolanaProvider | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    phantom?: { solana?: PhantomSolanaProvider }
    solana?: PhantomSolanaProvider
  }
  const provider = w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null)
  if (!provider?.signAndSendTransaction) return null
  return provider
}

/** Prefer Phantom mobile / in-app `signAndSendTransaction` (Blowfish-friendly). */
export async function phantomSignAndSendTransaction(
  tx: Transaction,
  connection: Connection,
): Promise<string | null> {
  const provider = phantomSolana()
  if (!provider?.signAndSendTransaction) return null
  const { signature } = await provider.signAndSendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 5,
    preflightCommitment: 'processed',
  })
  if (!signature) {
    throw new Error('Phantom did not return a transaction signature.')
  }
  // Ensure the tx is visible to our RPC (same as wallet-adapter path).
  await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })
  return signature
}

export function hasPhantomSignAndSend(): boolean {
  return phantomSolana() != null
}
