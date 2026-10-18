import {
  AddressLookupTableAccount,
  PublicKey,
  TransactionMessage,
  type TransactionInstruction,
} from '@solana/web3.js'

/** Solana UDP packet limit for a signed tx. */
export const SOLANA_PACKET_LIMIT = 1232

export type UnsignedPumpLockPath = 'atomic-v0' | 'signAllTransactions'

export const FEES_LOCKED_AT_LAUNCH_SINGLE =
  'Fees are locked at launch in this single v0 transaction (Pump create + fee-share). Do not call crew_wire_fees unless /api/agent/status says the lock failed.'

export const FEES_LOCKED_AT_LAUNCH_PAIR =
  'Fees are locked at launch. Sign every step together in one wallet signAllTransactions (or submit as one Jito bundle). Do not skip the lock step. crew_wire_fees is repair-only.'

/** Compact-u16 length prefix used by VersionedTransaction.serialize(). */
export function compactU16Bytes(n: number): number {
  if (n < 128) return 1
  if (n < 16384) return 2
  return 3
}

/** Wire size of a signed v0 tx: shortvec(n) + n*64 signatures + message. */
export function signedV0Bytes(messageBytes: number, numSigners: number): number {
  return compactU16Bytes(numSigners) + numSigners * 64 + messageBytes
}

export function chooseUnsignedPumpLockPath(combinedSignedBytes: number): UnsignedPumpLockPath {
  return combinedSignedBytes <= SOLANA_PACKET_LIMIT ? 'atomic-v0' : 'signAllTransactions'
}

export function compileUnsignedV0(opts: {
  payer: PublicKey
  ixs: TransactionInstruction[]
  blockhash: string
  alts?: AddressLookupTableAccount[]
}): { messageBase64: string; messageBytes: number; signedBytes: number; numSigners: number } {
  const message = new TransactionMessage({
    payerKey: opts.payer,
    recentBlockhash: opts.blockhash,
    instructions: opts.ixs,
  }).compileToV0Message(opts.alts || [])
  const numSigners = message.header.numRequiredSignatures
  try {
    const raw = Buffer.from(message.serialize())
    return {
      messageBase64: raw.toString('base64'),
      messageBytes: raw.byteLength,
      signedBytes: signedV0Bytes(raw.byteLength, numSigners),
      numSigners,
    }
  } catch {
    return {
      messageBase64: '',
      messageBytes: SOLANA_PACKET_LIMIT + 1,
      signedBytes: SOLANA_PACKET_LIMIT + 1,
      numSigners,
    }
  }
}
