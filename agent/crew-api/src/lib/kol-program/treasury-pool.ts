import { query } from '../db.js'
import { isPlatformTreasury, readPlatformBuybackWallet, readLegacyPlatformBuybackWallets } from '../agent/constants.js'
import { isEvmAddress } from '../agent/evm-address.js'
import { evmTreasuryConfigured, inferLaunchPlatformFromCoin } from '../agent/platforms.js'
import { KOL_PROGRAM_POINTS_DISCLAIMER } from './copy.js'
import { KOL_POOL_BPS, kolProgramEnabled } from './flags.js'

export type TreasuryReceiptTotals = {
  solana: { lamports: bigint; sol: number }
  base: { wei: bigint; eth: number }
}

export type SeasonPoolStatus = {
  seasonId: string
  poolBps: number
  receipts: TreasuryReceiptTotals
  poolSlice: TreasuryReceiptTotals
  disclaimer: string
  copy: string
}

/** JSON-safe pool totals (Express res.json cannot serialize bigint). */
export type TreasuryReceiptTotalsJson = {
  solana: { lamports: string; sol: number }
  base: { wei: string; eth: number }
}

export function treasuryReceiptTotalsToJson(t: TreasuryReceiptTotals): TreasuryReceiptTotalsJson {
  return {
    solana: { lamports: t.solana.lamports.toString(), sol: t.solana.sol },
    base: { wei: t.base.wei.toString(), eth: t.base.eth },
  }
}

export type SeasonPoolStatusJson = {
  seasonId: string
  poolBps: number
  receipts: TreasuryReceiptTotalsJson
  poolSlice: TreasuryReceiptTotalsJson
  disclaimer: string
  copy: string
}

export function seasonPoolStatusToJson(status: SeasonPoolStatus): SeasonPoolStatusJson {
  return {
    seasonId: status.seasonId,
    poolBps: status.poolBps,
    receipts: treasuryReceiptTotalsToJson(status.receipts),
    poolSlice: treasuryReceiptTotalsToJson(status.poolSlice),
    disclaimer: status.disclaimer,
    copy: status.copy,
  }
}

const POOL_TECHNICAL_NOTE =
  'Pool totals use indexed treasury creator-fee receipts (Solana + Base). Payouts are non-custodial unsigned transactions for manual review and signing only.'

export function poolSliceFromReceipts(receipts: TreasuryReceiptTotals, poolBps = KOL_POOL_BPS): TreasuryReceiptTotals {
  const mul = BigInt(Math.max(0, Math.min(10_000, poolBps)))
  const div = 10_000n
  const solLamports = (receipts.solana.lamports * mul) / div
  const baseWei = (receipts.base.wei * mul) / div
  return {
    solana: { lamports: solLamports, sol: Number(solLamports) / 1e9 },
    base: { wei: baseWei, eth: Number(baseWei) / 1e18 },
  }
}

function lamportsFromSol(amountSol: number): bigint {
  return BigInt(Math.round(Math.max(0, amountSol) * 1e9))
}

function weiFromEth(amountEth: number): bigint {
  return BigInt(Math.round(Math.max(0, amountEth) * 1e18))
}

/** Idempotent backfill from locked-coin remits attributed to platform / treasury wallets. */
export async function syncTreasuryReceiptsFromRemits(): Promise<number> {
  if (!kolProgramEnabled()) return 0
  const current = readPlatformBuybackWallet()
  const legacy = readLegacyPlatformBuybackWallets()
  const treasuryWallets = [...new Set([current, ...legacy].filter((w) => w && w.length >= 32))]
  const evmTreasury = evmTreasuryConfigured()
    ? (
        process.env.CLANKER_TREASURY_ADDRESS ||
        process.env.ZORA_TREASURY_ADDRESS ||
        process.env.CREW_BUYBACK_WALLET_EVM ||
        ''
      ).trim()
    : ''

  const { rows } = await query<Record<string, unknown>>(
    `SELECT r.signature, r.mint, r.wallet, r.amount_sol, r.at,
            COALESCE(cs.role, '') AS role,
            c.pump_url AS pump_url
     FROM remits r
     INNER JOIN coins c ON c.mint = r.mint AND c.fee_share_signature IS NOT NULL
     LEFT JOIN coin_shareholders cs ON cs.mint = r.mint AND cs.wallet = r.wallet
     WHERE COALESCE(cs.role, '') = 'platform'
        OR r.wallet = ANY($1::text[])
        OR ($2::text <> '' AND r.wallet = $2)`,
    [treasuryWallets, evmTreasury],
  )

  let inserted = 0
  for (const row of rows) {
    const wallet = String(row.wallet || '')
    const amountSol = Number(row.amount_sol || 0)
    if (amountSol <= 0) continue
    const platform = inferLaunchPlatformFromCoin({
      pumpUrl: String(row.pump_url || ''),
      mint: String(row.mint || ''),
    })
    const isBase =
      isEvmAddress(wallet) ||
      ['zora', 'clanker', 'vibevibe'].includes(platform)
    const chain = isBase ? 'base' : 'solana'
    const currency = isBase ? 'ETH' : 'SOL'
    const amountRaw = isBase ? weiFromEth(amountSol) : lamportsFromSol(amountSol)
    const id = `ktr_${chain}_${String(row.signature)}_${wallet.slice(0, 12)}`
    const res = await query(
      `INSERT INTO kol_treasury_fee_receipts (id, chain, tx_id, amount_raw, currency, received_at, mint, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'remit_index')
       ON CONFLICT (chain, tx_id, mint, amount_raw) DO NOTHING
       RETURNING id`,
      [
        id,
        chain,
        String(row.signature),
        amountRaw.toString(),
        currency,
        new Date(String(row.at)),
        String(row.mint),
      ],
    )
    if (res.rows.length) inserted += 1
    else if (isPlatformTreasury(wallet) && !isBase) {
      // legacy rows without shareholder role still count on solana
      const id2 = `ktr_sol_${String(row.signature)}_${wallet.slice(0, 8)}`
      const res2 = await query(
        `INSERT INTO kol_treasury_fee_receipts (id, chain, tx_id, amount_raw, currency, received_at, mint, source)
         VALUES ($1,'solana',$2,$3,'SOL',$4,$5,'remit_index')
         ON CONFLICT (chain, tx_id, mint, amount_raw) DO NOTHING
         RETURNING id`,
        [id2, String(row.signature), lamportsFromSol(amountSol).toString(), new Date(String(row.at)), String(row.mint)],
      )
      if (res2.rows.length) inserted += 1
    }
  }
  return inserted
}

export async function sumTreasuryReceiptsBetween(
  start: Date,
  end: Date,
): Promise<TreasuryReceiptTotals> {
  const { rows } = await query<{ chain: string; total: string }>(
    `SELECT chain, COALESCE(SUM(amount_raw), 0)::text AS total
     FROM kol_treasury_fee_receipts
     WHERE received_at >= $1 AND received_at < $2
     GROUP BY chain`,
    [start, end],
  )
  let solLamports = 0n
  let baseWei = 0n
  for (const r of rows) {
    const n = BigInt(r.total || '0')
    if (r.chain === 'base') baseWei += n
    else solLamports += n
  }
  return {
    solana: { lamports: solLamports, sol: Number(solLamports) / 1e9 },
    base: { wei: baseWei, eth: Number(baseWei) / 1e18 },
  }
}

export async function seasonBounds(seasonId: string): Promise<{ start: Date; end: Date } | null> {
  const { rows } = await query<{ starts_at: Date; ends_at: Date | null; archived_at: Date | null }>(
    `SELECT starts_at, ends_at, archived_at FROM kol_program_seasons WHERE id = $1`,
    [seasonId],
  )
  const row = rows[0]
  if (!row) return null
  const start = new Date(row.starts_at)
  const end = row.ends_at ? new Date(row.ends_at) : row.archived_at ? new Date(row.archived_at) : new Date()
  return { start, end }
}

export async function currentSeasonPoolStatus(seasonId: string): Promise<SeasonPoolStatus> {
  await syncTreasuryReceiptsFromRemits()
  const bounds = await seasonBounds(seasonId)
  const start = bounds?.start ?? new Date()
  const end = bounds?.end ?? new Date()
  const receipts = await sumTreasuryReceiptsBetween(start, end)
  const poolSlice = poolSliceFromReceipts(receipts)
  return {
    seasonId,
    poolBps: KOL_POOL_BPS,
    receipts,
    poolSlice,
    disclaimer: KOL_PROGRAM_POINTS_DISCLAIMER,
    copy: POOL_TECHNICAL_NOTE,
  }
}

/** Leaderboard must stay up if pool indexing fails (missing table, RPC, etc.). */
export async function tryCurrentSeasonPoolStatus(
  seasonId: string,
): Promise<{ ok: true; status: SeasonPoolStatus } | { ok: false }> {
  try {
    const status = await currentSeasonPoolStatus(seasonId)
    return { ok: true, status }
  } catch {
    return { ok: false }
  }
}
