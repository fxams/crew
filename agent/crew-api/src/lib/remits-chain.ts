/**
 * Validate board remits against confirmed Pump distributeCreatorFees txs.
 * Adapted from agent/crew remits-chain parsing.
 */

import { PublicKey, type Connection, type VersionedTransactionResponse } from '@solana/web3.js'
import { createRequire } from 'node:module'
import { getConnection } from './agent/send.js'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pump = require('@pump-fun/pump-sdk') as typeof import('@pump-fun/pump-sdk')

const DISTRIBUTE_EVENT_DISC = Buffer.from([165, 55, 129, 112, 4, 179, 202, 40])

export type ParsedRemitRow = {
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
): ParsedRemitRow[] {
  const sdk = new pump.PumpSdk()
  const atMs = (tx.blockTime ?? 0) * 1000
  const rows: ParsedRemitRow[] = []

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

    const keys = tx.transaction.message.getAccountKeys({
      accountKeysFromLookups: tx.meta?.loadedAddresses,
    })
    const pre = tx.meta?.preBalances
    const post = tx.meta?.postBalances
    const fee = BigInt(tx.meta?.fee ?? 0)
    let feePayer: string | null = null
    try {
      feePayer = keys.get(0)?.toBase58() ?? null
    } catch {
      feePayer = null
    }
    const deltaByWallet = new Map<string, bigint>()
    if (pre && post && pre.length === post.length) {
      for (let i = 0; i < pre.length; i += 1) {
        const delta = BigInt(post[i]!) - BigInt(pre[i]!)
        if (delta === 0n) continue
        try {
          const wallet = keys.get(i)?.toBase58()
          if (wallet) deltaByWallet.set(wallet, (deltaByWallet.get(wallet) || 0n) + delta)
        } catch {
          /* ignore */
        }
      }
    }

    for (const sh of event.shareholders) {
      const wallet = sh.address.toBase58()
      const fromBps = (total * BigInt(sh.shareBps)) / 10_000n
      let fromMeta = deltaByWallet.get(wallet)
      if (fromMeta != null && feePayer && wallet === feePayer && fee > 0n) {
        fromMeta += fee
      }
      const lamports = fromMeta != null && fromMeta > 0n ? fromMeta : fromBps
      if (lamports <= 0n) continue
      rows.push({
        signature,
        wallet,
        amountSol: Number(lamports) / 1e9,
        at,
      })
    }
  }

  return rows
}

/**
 * True when the confirmed tx distributes creator fees for `mint` to `wallet`
 * (fee-sharing payout). Amount is not strictly required to match (rounding).
 */
export function remitPaidInRows(
  rows: ParsedRemitRow[],
  wallet: string,
): boolean {
  const target = wallet.trim()
  if (!target) return false
  return rows.some((r) => r.wallet === target && r.amountSol > 0)
}

export async function assertRemitOnChain(opts: {
  mint: string
  wallet: string
  signature: string
  connection?: Connection
}): Promise<void> {
  const conn = opts.connection ?? getConnection()
  const tx = await conn.getTransaction(opts.signature, {
    maxSupportedTransactionVersion: 1,
    commitment: 'confirmed',
  })
  if (!tx || tx.meta?.err) {
    throw new Error('Remit signature is not a confirmed successful transaction')
  }
  let mintPk: PublicKey
  try {
    mintPk = new PublicKey(opts.mint)
  } catch {
    throw new Error('Invalid mint')
  }
  // Prefer fee-sharing config address presence in account keys when available.
  const sharing = pump.feeSharingConfigPda(mintPk)
  const keys = tx.transaction.message.getAccountKeys({
    accountKeysFromLookups: tx.meta?.loadedAddresses,
  })
  let sawSharing = false
  for (let i = 0; i < keys.length; i += 1) {
    try {
      if (keys.get(i)?.equals(sharing)) {
        sawSharing = true
        break
      }
    } catch {
      /* ignore */
    }
  }
  const rows = parseDistributeRowsFromTx(tx, opts.signature, mintPk)
  if (!remitPaidInRows(rows, opts.wallet)) {
    throw new Error(
      sawSharing
        ? 'Remit wallet was not paid in this fee-share distribute tx'
        : 'Remit signature is not a fee-share distribute payout for this mint/wallet',
    )
  }
}
