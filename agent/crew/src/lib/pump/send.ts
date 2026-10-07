import {
  Keypair,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js'
import type { WalletContextState } from '@solana/wallet-adapter-react'
import { SOLSCAN_TX_URL } from '../config'
import { getConnection, getLatestBlockhashSafe } from './connection'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isBlockHeightExpired(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err)
  return /block height exceeded|has expired|blockhash not found|expired/i.test(text)
}

/**
 * Poll signature status without relying on the original blockhash window.
 * Phantom approval can eat most of the ~60s blockhash lifetime; the tx may
 * still land after confirmTransaction throws "block height exceeded".
 */
export async function confirmSignatureSafe(
  signature: string,
  timeoutMs = 90_000,
): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const connection = getConnection()
    const { value } = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    })
    const status = value[0]
    if (status?.err) {
      throw new Error(`Transaction failed on-chain. ${SOLSCAN_TX_URL(signature)}`)
    }
    if (
      status?.confirmationStatus === 'confirmed' ||
      status?.confirmationStatus === 'finalized'
    ) {
      return
    }
    await sleep(1_400)
  }

  const connection = getConnection()
  const { value } = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  })
  const status = value[0]
  if (
    status &&
    !status.err &&
    (status.confirmationStatus === 'confirmed' ||
      status.confirmationStatus === 'finalized' ||
      status.confirmationStatus === 'processed')
  ) {
    return
  }
  throw new Error(
    `Confirmation timed out. If Phantom shows success, open ${SOLSCAN_TX_URL(signature)}`,
  )
}

export type SendIxsOpts = {
  wallet: WalletContextState
  ixs: TransactionInstruction[]
  /** Extra signers (e.g. mint keypair on create). */
  signers?: Keypair[]
  /** Total attempts including the first send. */
  attempts?: number
}

/**
 * Fresh blockhash → wallet send → status-poll confirm.
 * Retries once with a new blockhash if the first never lands.
 */
export async function sendInstructions(opts: SendIxsOpts): Promise<string> {
  const { wallet, ixs, signers = [], attempts = 2 } = opts
  if (!wallet.publicKey || !wallet.sendTransaction) {
    throw new Error('Wallet not ready.')
  }

  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // Fetch as late as possible — Phantom approval still burns some lifetime.
      const { blockhash, lastValidBlockHeight } =
        await getLatestBlockhashSafe('processed')
      const connection = getConnection()
      const tx = new Transaction({
        feePayer: wallet.publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(...ixs)

      const signature = await wallet.sendTransaction(tx, connection, {
        signers,
        skipPreflight: false,
        maxRetries: 5,
        preflightCommitment: 'processed',
      })

      try {
        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          'confirmed',
        )
      } catch (confirmErr) {
        // Blockhash window often dies while waiting; check if it actually landed.
        if (isBlockHeightExpired(confirmErr)) {
          await confirmSignatureSafe(signature)
          return signature
        }
        // Other confirm errors — still probe status before failing.
        try {
          await confirmSignatureSafe(signature, 20_000)
          return signature
        } catch {
          throw confirmErr
        }
      }
      return signature
    } catch (err) {
      lastErr = err
      console.warn(`sendInstructions attempt ${attempt}/${attempts} failed`, err)
      // If we already have a signature-shaped error message, don't blind-retry mint creates.
      if (attempt < attempts && (isBlockHeightExpired(err) || /not confirmed|timed out/i.test(String(err)))) {
        await sleep(600)
        continue
      }
      break
    }
  }

  const text = lastErr instanceof Error ? lastErr.message : String(lastErr)
  if (isBlockHeightExpired(lastErr)) {
    throw new Error(
      'Transaction expired before confirm (approve Phantom faster, then retry). Blockhash lasts ~60s.',
    )
  }
  throw lastErr instanceof Error ? lastErr : new Error(text || 'Send failed.')
}
