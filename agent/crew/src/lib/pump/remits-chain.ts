import { PublicKey, type Connection, type VersionedTransactionResponse } from '@solana/web3.js'
import { feeSharingConfigPda } from '@pump-fun/pump-sdk'
import type { CoinRecord, RemitRecord } from '../types'
import { getConnection, getPumpSdk } from './connection'
export { isChainRemit, walletToHandle } from './remits-chain-helpers'
import { walletToHandle } from './remits-chain-helpers'

const DISTRIBUTE_EVENT_DISC = Buffer.from([165, 55, 129, 112, 4, 179, 202, 40])

type ParsedRow = {
  signature: string
  wallet: string
  amountSol: number
  at: number
}

/** Parse Pump `distributeCreatorFeesEvent` logs from a confirmed transaction. */
export function parseDistributeRowsFromTx(
  tx: VersionedTransactionResponse,
  signature: string,
  mintFilter?: PublicKey,
): ParsedRow[] {
  const sdk = getPumpSdk()
  const atMs = (tx.blockTime ?? 0) * 1000
  const rows: ParsedRow[] = []

  for (const line of tx.meta?.logMessages ?? []) {
    const marker = 'Program data: '
    const idx = line.indexOf(marker)
    if (idx === -1) continue
    const data = Buffer.from(line.slice(idx + marker.length).trim(), 'base64')
    if (data.length < 8 || !data.subarray(0, 8).equals(DISTRIBUTE_EVENT_DISC)) continue

    let event
    try {
      event = sdk.decodeDistributeCreatorFeesEvent(data.subarray(8))
    } catch {
      continue
    }
    if (mintFilter && !event.mint.equals(mintFilter)) continue

    const total = BigInt(event.distributed.toString())
    if (total <= 0n) continue
    const at = atMs || Number(event.timestamp) * 1000

    for (const sh of event.shareholders) {
      const lamports = (total * BigInt(sh.shareBps)) / 10_000n
      if (lamports <= 0n) continue
      rows.push({
        signature,
        wallet: sh.address.toBase58(),
        amountSol: Number(lamports) / 1e9,
        at,
      })
    }
  }

  return rows
}

export function rowsToRemits(coin: CoinRecord, rows: ParsedRow[]): RemitRecord[] {
  return rows.map((row) => ({
    id: `chain_${row.signature.slice(0, 12)}_${row.wallet.slice(0, 8)}`,
    mint: coin.mint,
    ticker: coin.ticker,
    handle: walletToHandle(coin, row.wallet),
    wallet: row.wallet,
    amountSol: Number(row.amountSol.toFixed(9)),
    mode: coin.mode,
    at: row.at,
    signature: row.signature,
    source: 'chain' as const,
  }))
}

async function fetchParsedRows(
  connection: Connection,
  address: PublicKey,
  mint: PublicKey,
  maxSignatures: number,
): Promise<ParsedRow[]> {
  const sigs = await connection.getSignaturesForAddress(address, { limit: maxSignatures })
  const rows: ParsedRow[] = []
  const seen = new Set<string>()

  for (const entry of sigs) {
    if (entry.err) continue
    const tx = await connection.getTransaction(entry.signature, {
      maxSupportedTransactionVersion: 1,
      commitment: 'confirmed',
    })
    if (!tx) continue
    for (const row of parseDistributeRowsFromTx(tx, entry.signature, mint)) {
      const key = `${row.signature}:${row.wallet}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }
  }
  return rows
}

export type SyncChainRemitsOpts = {
  maxSignaturesPerMint?: number
  connection?: Connection
}

/**
 * Load real creator-fee distributions from mainnet for board coins.
 * Only `distributeCreatorFees*` payouts appear — not local simulations.
 */
export async function syncChainRemitsForCoins(
  coins: CoinRecord[],
  opts: SyncChainRemitsOpts = {},
): Promise<RemitRecord[]> {
  const maxSignatures = opts.maxSignaturesPerMint ?? 120
  const connection = opts.connection ?? getConnection()
  const all: RemitRecord[] = []
  const dedupe = new Set<string>()

  for (const coin of coins) {
    if (!coin.feeShareSignature && !coin.mint) continue
    let mint: PublicKey
    try {
      mint = new PublicKey(coin.mint)
    } catch {
      continue
    }

    const sharing = feeSharingConfigPda(mint)
    const sharingInfo = await connection.getAccountInfo(sharing)
    if (!sharingInfo && !coin.feeShareSignature) continue

    const fromMint = await fetchParsedRows(connection, mint, mint, maxSignatures)
    const fromSharing = sharingInfo
      ? await fetchParsedRows(connection, sharing, mint, maxSignatures)
      : []
    const mergedRows = [...fromMint, ...fromSharing]

    for (const row of rowsToRemits(coin, mergedRows)) {
      const key = `${row.signature}:${row.wallet}`
      if (dedupe.has(key)) continue
      dedupe.add(key)
      all.push(row)
    }
  }

  all.sort((a, b) => b.at - a.at)
  return all.slice(0, 200)
}

/** Ingest one crank / distribute tx immediately after it confirms. */
export async function remitsFromSignature(
  signature: string,
  coin: CoinRecord,
  connection?: Connection,
): Promise<RemitRecord[]> {
  const conn = connection ?? getConnection()
  const tx = await conn.getTransaction(signature, {
    maxSupportedTransactionVersion: 1,
    commitment: 'confirmed',
  })
  if (!tx) return []
  const mint = new PublicKey(coin.mint)
  const rows = parseDistributeRowsFromTx(tx, signature, mint)
  return rowsToRemits(coin, rows)
}
