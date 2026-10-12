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
import {
  jitoBackoffMs,
  jitoBundleAttempts,
  jitoRpc,
  jitoSendBundleBroadcast,
  jitoTipLamports,
  resolveJitoTipAccount,
} from './jito.js'

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
  const raw = process.env.CREW_OPS_KEY?.trim() || ''
  if (raw) {
    try {
      return parseLauncherKey(raw)
    } catch {
      /* fall through */
    }
  }
  if (preferred) return preferred
  throw new Error('No crank payer — set CREW_OPS_KEY, or pass x-launcher-key.')
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

type JitoInflightStatus =
  | 'Invalid'
  | 'Pending'
  | 'Failed'
  | 'Landed'
  | string

async function waitForJitoBundle(opts: {
  bundleId: string
  urls: string[]
  signatures: string[]
  connection: Connection
  timeoutMs?: number
}): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 90_000
  const started = Date.now()
  let lastStatus = 'Pending'

  while (Date.now() - started < timeoutMs) {
    // Prefer engine status over public RPC (bundle can land before RPC indexes).
    for (const url of opts.urls) {
      try {
        const statuses = (await jitoRpc(url, 'getInflightBundleStatuses', [
          [opts.bundleId],
        ])) as { status?: JitoInflightStatus; landed_slot?: number }[] | null
        const st = Array.isArray(statuses) ? statuses[0] : null
        const status = st?.status || ''
        if (status) lastStatus = status
        if (status === 'Landed') {
          // Best-effort RPC confirm; don't fail if indexing lags.
          try {
            await confirmSignature(opts.connection, opts.signatures[0]!, 15_000)
          } catch {
            /* landed per Jito is enough for launch path */
          }
          return
        }
        if (status === 'Failed' || status === 'Invalid') {
          throw new Error(`Jito bundle ${status}: ${opts.bundleId}`)
        }
      } catch (err) {
        if (err instanceof Error && /Jito bundle (Failed|Invalid)/.test(err.message)) {
          throw err
        }
        /* try next engine / fall through to RPC */
      }
    }

    // RPC shortcut — any signature confirmed means the bundle (or race) landed.
    try {
      const { value } = await opts.connection.getSignatureStatuses(opts.signatures, {
        searchTransactionHistory: true,
      })
      const anyErr = value.find((v) => v?.err)
      if (anyErr?.err) {
        throw new Error(`Jito bundle tx failed on-chain: ${JSON.stringify(anyErr.err)}`)
      }
      if (
        value.some(
          (v) =>
            v?.confirmationStatus === 'confirmed' || v?.confirmationStatus === 'finalized',
        )
      ) {
        return
      }
    } catch (err) {
      if (err instanceof Error && /failed on-chain/.test(err.message)) throw err
    }

    await sleep(1_200)
  }
  throw new Error(
    `Jito bundle not landed (${lastStatus}) bundle=${opts.bundleId} sig0=${opts.signatures[0]}`,
  )
}

/**
 * Land multiple instruction groups as a Jito bundle (atomic ordering).
 * Tip is appended to the **last** business tx (not a separate tip-only tx).
 * Closes the create→fee-lock sniper window when a single tx is too large.
 */
export async function sendJitoBundle(opts: {
  payer: Keypair
  steps: { ixs: TransactionInstruction[]; signers?: Keypair[] }[]
  /** Lamports tip to Jito (default CREW_JITO_TIP_LAMPORTS or 1_000_000). */
  tipLamports?: number
}): Promise<{ signatures: string[]; bundleId: string; engine: string }> {
  if (opts.steps.length < 1 || opts.steps.length > 5) {
    throw new Error('Jito bundle needs 1–5 steps')
  }
  const connection = getConnection()
  const attempts = jitoBundleAttempts()

  // Retry with a fresh blockhash, refreshed tip account, and scaled tip.
  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const tipLamports = jitoTipLamports(opts.tipLamports, attempt)
      const tipAccount = new PublicKey(await resolveJitoTipAccount())
      const { blockhash } = await connection.getLatestBlockhash('confirmed')
      const tipIx = SystemProgram.transfer({
        fromPubkey: opts.payer.publicKey,
        toPubkey: tipAccount,
        lamports: tipLamports,
      })

      const encoded: string[] = []
      const signatures: string[] = []

      for (let i = 0; i < opts.steps.length; i += 1) {
        const step = opts.steps[i]!
        const isLast = i === opts.steps.length - 1
        const ixs = isLast ? [...step.ixs, tipIx] : step.ixs
        const v0 = await buildVersioned(
          connection,
          opts.payer,
          ixs,
          step.signers || [],
          blockhash,
        )
        if (v0.bytes > 1232) {
          throw new Error(
            `Jito step ${i} too large (${v0.bytes} bytes). Shrink crew or set CREW_LOOKUP_TABLE.`,
          )
        }
        encoded.push(Buffer.from(v0.raw).toString('base64'))
        signatures.push(v0.signature)
      }

      const { bundleId, urls } = await jitoSendBundleBroadcast(encoded)
      await waitForJitoBundle({
        bundleId,
        urls,
        signatures,
        connection,
        timeoutMs: attempt === 1 ? 45_000 : 60_000,
      })
      return { signatures, bundleId, engine: urls[0]! }
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      // Don't retry oversized steps.
      if (/too large/.test(msg)) throw err
      console.warn(`Jito bundle attempt ${attempt}/${attempts} failed`, msg)
      if (attempt >= attempts) break
      await sleep(jitoBackoffMs(attempt))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Jito bundle failed')
}

/** True when RPC reports confirmed/finalized (does not throw on timeout). */
export async function signatureIsConfirmed(
  signature: string,
  timeoutMs = 20_000,
): Promise<boolean> {
  try {
    await confirmSignature(getConnection(), signature, timeoutMs)
    return true
  } catch {
    return false
  }
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

/** Create-tx block time in ms (null if unknown). Prefer over server Date.now() for launchedAt. */
export async function getSignatureBlockTimeMs(signature: string): Promise<number | null> {
  try {
    const connection = getConnection()
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 1,
      commitment: 'confirmed',
    })
    return tx?.blockTime != null ? tx.blockTime * 1000 : null
  } catch {
    return null
  }
}

/**
 * Sum launcher creator-vault balance increases in txs with slot in [createSlot, lockSlot).
 * Excludes the create and lock signatures themselves. Best-effort; returns null on RPC errors.
 */
export async function estimatePreLockCreatorFeesLamports(opts: {
  launcher: PublicKey
  createSignature: string
  lockSignature: string
  createSlot: number | null
  lockSlot: number | null
}): Promise<number | null> {
  const { createSlot, lockSlot } = opts
  if (createSlot == null || lockSlot == null || lockSlot <= createSlot) return 0
  try {
    // Lazy require — same BN ESM issue as other pump imports.
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pump = require('@pump-fun/pump-sdk') as typeof import('@pump-fun/pump-sdk')
    const vault = pump.creatorVaultPda(opts.launcher)
    const connection = getConnection()
    const sigs = await connection.getSignaturesForAddress(vault, { limit: 40 })
    let total = 0n
    for (const entry of sigs) {
      if (entry.err) continue
      if (entry.signature === opts.createSignature || entry.signature === opts.lockSignature) {
        continue
      }
      const slot = entry.slot
      if (slot < createSlot || slot >= lockSlot) continue
      const tx = await connection.getTransaction(entry.signature, {
        maxSupportedTransactionVersion: 1,
        commitment: 'confirmed',
      })
      if (!tx?.meta?.preBalances || !tx.meta.postBalances) continue
      const keys = tx.transaction.message.getAccountKeys({
        accountKeysFromLookups: tx.meta.loadedAddresses,
      })
      const vaultStr = vault.toBase58()
      for (let i = 0; i < tx.meta.preBalances.length; i += 1) {
        try {
          if (keys.get(i)?.toBase58() !== vaultStr) continue
          const delta = BigInt(tx.meta.postBalances[i]!) - BigInt(tx.meta.preBalances[i]!)
          if (delta > 0n) total += delta
        } catch {
          /* ignore */
        }
      }
    }
    return Number(total)
  } catch (err) {
    console.warn(
      'preLockCreatorFeesLamports estimate failed',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
