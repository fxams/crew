import {
  AddressLookupTableAccount,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js'
import bs58 from 'bs58'
import { rpcUrl } from './constants.js'

/** Well-known Jito tip accounts (mainnet). */
const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiUV5CwfOwksMrsVfnxpk',
  'HFqU5x63VTqvQss8hp11i4bVmkNWgQAvp9J2iWkxXkK',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvZqfPicUDBgVYmHtgJJpiZ',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
]

const JITO_BUNDLE_URL =
  process.env.CREW_JITO_BUNDLE_URL?.trim() ||
  'https://mainnet.block-engine.jito.wtf/api/v1/bundles'

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

/** Ops / crank payer: CREW_OPS_KEY, else buyback key, else launcher. */
export function resolveOpsPayer(preferred?: Keypair): Keypair {
  const raw =
    process.env.CREW_OPS_KEY?.trim() ||
    process.env.CREW_BUYBACK_PRIVATE_KEY?.trim() ||
    ''
  if (raw) {
    try {
      return parseLauncherKey(raw)
    } catch {
      /* fall through */
    }
  }
  if (preferred) return preferred
  throw new Error(
    'No crank payer — set CREW_OPS_KEY (or CREW_BUYBACK_PRIVATE_KEY), or pass x-launcher-key.',
  )
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

async function loadLookupTables(
  connection: Connection,
): Promise<AddressLookupTableAccount[]> {
  const raw = process.env.CREW_LOOKUP_TABLE?.trim() || ''
  if (!raw) return []
  const out: AddressLookupTableAccount[] = []
  for (const part of raw.split(/[\s,]+/).filter(Boolean)) {
    try {
      const key = new PublicKey(part)
      const res = await connection.getAddressLookupTable(key)
      if (res.value) out.push(res.value)
    } catch {
      console.warn('CREW_LOOKUP_TABLE entry invalid or missing', part)
    }
  }
  return out
}

function serializeLegacy(
  payer: Keypair,
  ixs: TransactionInstruction[],
  signers: Keypair[],
  blockhash: string,
  lastValidBlockHeight: number,
): { raw: Buffer; signature: string } {
  const tx = new Transaction({
    feePayer: payer.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(...ixs)
  tx.partialSign(payer, ...signers)
  const raw = tx.serialize()
  return { raw, signature: bs58.encode(raw.subarray(1, 65)) }
}

async function buildVersioned(
  connection: Connection,
  payer: Keypair,
  ixs: TransactionInstruction[],
  signers: Keypair[],
  blockhash: string,
): Promise<{ tx: VersionedTransaction; raw: Buffer; signature: string; bytes: number }> {
  const alts = await loadLookupTables(connection)
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message(alts)
  const tx = new VersionedTransaction(msg)
  tx.sign([payer, ...signers])
  const raw = Buffer.from(tx.serialize())
  const signature = bs58.encode(tx.signatures[0]!)
  return { tx, raw, signature, bytes: raw.length }
}

/** Serialized size check for tests / preflight (v0, optional ALT from env). */
export async function measureSerializedBytes(opts: {
  payer: Keypair
  ixs: TransactionInstruction[]
  signers?: Keypair[]
}): Promise<{ legacyBytes: number; v0Bytes: number; packetLimit: number }> {
  const connection = getConnection()
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const legacy = serializeLegacy(
    opts.payer,
    opts.ixs,
    opts.signers || [],
    blockhash,
    lastValidBlockHeight,
  )
  const v0 = await buildVersioned(
    connection,
    opts.payer,
    opts.ixs,
    opts.signers || [],
    blockhash,
  )
  return { legacyBytes: legacy.raw.length, v0Bytes: v0.bytes, packetLimit: 1232 }
}

export async function sendInstructions(opts: {
  payer: Keypair
  ixs: TransactionInstruction[]
  signers?: Keypair[]
  attempts?: number
  /** Force legacy Transaction (default: try v0 then legacy). */
  preferLegacy?: boolean
}): Promise<string> {
  const { payer, ixs, signers = [], attempts = 2, preferLegacy = false } = opts
  const connection = getConnection()
  let lastErr: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

      if (!preferLegacy) {
        try {
          const v0 = await buildVersioned(connection, payer, ixs, signers, blockhash)
          if (v0.bytes <= 1232) {
            const signature = await connection.sendRawTransaction(v0.raw, {
              skipPreflight: false,
              preflightCommitment: 'confirmed',
              maxRetries: 3,
            })
            await confirmSignature(connection, signature)
            return signature
          }
        } catch (v0Err) {
          lastErr = v0Err
          // fall through to legacy
        }
      }

      const legacy = serializeLegacy(payer, ixs, signers, blockhash, lastValidBlockHeight)
      if (legacy.raw.length > 1232) {
        throw new Error(
          `Transaction too large (${legacy.raw.length} bytes > 1232). Use CREW_LOOKUP_TABLE (v0+ALT) or Jito atomic bundle.`,
        )
      }
      const signature = await connection.sendRawTransaction(legacy.raw, {
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

async function jitoSendBundle(encodedTxs: string[]): Promise<string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const uuid = process.env.CREW_JITO_UUID?.trim()
  if (uuid) headers['x-jito-auth'] = uuid

  const res = await fetch(JITO_BUNDLE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendBundle',
      params: [encodedTxs],
    }),
  })
  const json = (await res.json()) as {
    result?: string
    error?: { message?: string }
  }
  if (json.error?.message) throw new Error(`Jito bundle: ${json.error.message}`)
  if (!json.result) throw new Error(`Jito bundle failed (HTTP ${res.status})`)
  return String(json.result)
}

/**
 * Land multiple instruction groups as a Jito bundle (atomic ordering).
 * Closes the create→fee-lock sniper window when a single tx is too large.
 */
export async function sendJitoBundle(opts: {
  payer: Keypair
  steps: { ixs: TransactionInstruction[]; signers?: Keypair[] }[]
  /** Lamports tip to Jito (default 100_000 = 0.0001 SOL). */
  tipLamports?: number
}): Promise<{ signatures: string[]; bundleId: string }> {
  if (opts.steps.length < 1 || opts.steps.length > 4) {
    throw new Error('Jito bundle needs 1–4 steps')
  }
  const connection = getConnection()
  const { blockhash } = await connection.getLatestBlockhash('confirmed')
  const tipLamports = Math.max(1_000, opts.tipLamports ?? 100_000)
  const tipAccount = new PublicKey(
    JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]!,
  )

  const encoded: string[] = []
  const signatures: string[] = []

  for (const step of opts.steps) {
    const v0 = await buildVersioned(
      connection,
      opts.payer,
      step.ixs,
      step.signers || [],
      blockhash,
    )
    encoded.push(Buffer.from(v0.raw).toString('base64'))
    signatures.push(v0.signature)
  }

  // Tip as final tx so the bundle lands.
  const tipIx = SystemProgram.transfer({
    fromPubkey: opts.payer.publicKey,
    toPubkey: tipAccount,
    lamports: tipLamports,
  })
  const tipTx = await buildVersioned(connection, opts.payer, [tipIx], [], blockhash)
  encoded.push(Buffer.from(tipTx.raw).toString('base64'))

  const bundleId = await jitoSendBundle(encoded)

  // Confirm first (create) and last business signature.
  for (const sig of signatures) {
    await confirmSignature(connection, sig, 120_000)
  }
  return { signatures, bundleId }
}

/** Slot of a confirmed signature (null if unknown). */
export async function getSignatureSlot(signature: string): Promise<number | null> {
  try {
    const connection = getConnection()
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 1,
      commitment: 'confirmed',
    })
    return tx?.slot ?? null
  } catch {
    return null
  }
}
