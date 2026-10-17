import { query } from '../db.js'
import { isPayoutWallet } from '../agent/shareholders.js'
import { isEvmAddress } from '../agent/evm-address.js'
import { KOL_POOL_TOP_N } from './flags.js'
import { accountAgeDays, checkAntiFarm } from './anti-farm.js'
import { poolSliceFromReceipts, type TreasuryReceiptTotals } from './treasury-pool.js'

export type PoolAllocationRow = {
  rank: number
  xUserId: string
  handle: string
  seasonPoints: number
  founderNumber: number | null
  shareBps: number
  solanaWallet: string | null
  evmWallet: string | null
  solanaLamports: string
  baseWei: string
}

export type PoolManifest = {
  seasonId: string
  poolBps: number
  topN: number
  totalSeasonPoints: number
  treasuryReceipts: TreasuryReceiptTotals
  poolSlice: TreasuryReceiptTotals
  allocations: PoolAllocationRow[]
  disclaimer: string
  lexActions: string[]
}

export async function eligiblePoolKols(seasonId: string, topN = KOL_POOL_TOP_N): Promise<
  Array<{
    xUserId: string
    handle: string
    seasonPoints: number
    founderNumber: number | null
    wallet: string
    evmWallet: string | null
    followers: number
    accountCreatedAt: string | null
  }>
> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT p.x_user_id, p.x_username, p.season_points, p.founder_number, p.flagged_reason, p.revoked,
            p.crew_priority_opt_in, p.x_account_created_at,
            r.wallet, r.evm_wallet, r.followers
     FROM kol_program_profiles p
     INNER JOIN kol_registrations r ON r.x_user_id = p.x_user_id
     WHERE p.season_id = $1
       AND p.revoked = false
       AND p.flagged_reason IS NULL
       AND p.crew_priority_opt_in = true
       AND p.season_points > 0
     ORDER BY p.season_points DESC,
              CASE WHEN p.founder_number IS NULL THEN 999999 ELSE p.founder_number END ASC,
              p.enrolled_at ASC
     LIMIT $2`,
    [seasonId, topN],
  )
  const out: Array<{
    xUserId: string
    handle: string
    seasonPoints: number
    founderNumber: number | null
    wallet: string
    evmWallet: string | null
    followers: number
    accountCreatedAt: string | null
  }> = []
  for (const row of rows) {
    const followers = Number(row.followers || 0)
    const ageDays = accountAgeDays(row.x_account_created_at as string | null)
    const farm = checkAntiFarm({ accountAgeDays: ageDays, followers, referralsToday: 0 })
    if (!farm.ok) continue
    const wallet = String(row.wallet || '')
    if (!isPayoutWallet(wallet)) continue
    out.push({
      xUserId: String(row.x_user_id),
      handle: String(row.x_username),
      seasonPoints: Number(row.season_points),
      founderNumber: row.founder_number != null ? Number(row.founder_number) : null,
      wallet,
      evmWallet: row.evm_wallet ? String(row.evm_wallet) : null,
      followers,
      accountCreatedAt: row.x_account_created_at ? String(row.x_account_created_at) : null,
    })
  }
  return out
}

export function proRataAllocations(
  kols: Array<{
    xUserId: string
    handle: string
    seasonPoints: number
    founderNumber: number | null
    wallet: string
    evmWallet: string | null
  }>,
  poolSlice: TreasuryReceiptTotals,
): PoolAllocationRow[] {
  const totalPoints = kols.reduce((s, k) => s + k.seasonPoints, 0)
  if (totalPoints <= 0 || kols.length === 0) return []
  const solPool = poolSlice.solana.lamports
  const ethPool = poolSlice.base.wei
  let assignedSol = 0n
  let assignedEth = 0n
  const rows: PoolAllocationRow[] = []
  for (let i = 0; i < kols.length; i++) {
    const k = kols[i]!
    const isLast = i === kols.length - 1
    const shareBps = Math.round((k.seasonPoints / totalPoints) * 10_000)
    let solShare = (solPool * BigInt(k.seasonPoints)) / BigInt(totalPoints)
    let ethShare = (ethPool * BigInt(k.seasonPoints)) / BigInt(totalPoints)
    if (isLast) {
      solShare = solPool - assignedSol
      ethShare = ethPool - assignedEth
    }
    assignedSol += solShare
    assignedEth += ethShare
    rows.push({
      rank: i + 1,
      xUserId: k.xUserId,
      handle: k.handle,
      seasonPoints: k.seasonPoints,
      founderNumber: k.founderNumber,
      shareBps,
      solanaWallet: isPayoutWallet(k.wallet) ? k.wallet : null,
      evmWallet: k.evmWallet && isEvmAddress(k.evmWallet) ? k.evmWallet : null,
      solanaLamports: solShare.toString(),
      baseWei: ethShare.toString(),
    })
  }
  return rows
}

export function buildPoolManifest(input: {
  seasonId: string
  poolBps: number
  receipts: TreasuryReceiptTotals
  kols: Awaited<ReturnType<typeof eligiblePoolKols>>
}): PoolManifest {
  const poolSlice = poolSliceFromReceipts(input.receipts, input.poolBps)
  const allocations = proRataAllocations(input.kols, poolSlice)
  const totalSeasonPoints = input.kols.reduce((s, k) => s + k.seasonPoints, 0)
  return {
    seasonId: input.seasonId,
    poolBps: input.poolBps,
    topN: KOL_POOL_TOP_N,
    totalSeasonPoints,
    treasuryReceipts: input.receipts,
    poolSlice,
    allocations,
    disclaimer:
      'Allocations are pro-rata by season points among eligible top KOLs. Based on indexed treasury receipts only. Unsigned txs must be reviewed and signed manually — CrewPay never holds keys or auto-sends.',
    lexActions: [
      'Review manifest allocations and treasury receipt totals.',
      'Sign Solana payout transaction(s) from the CrewPay treasury wallet (fee payer).',
      'Sign Base native ETH transfer(s) from the configured EVM treasury address if baseWei allocations are non-zero.',
      'Broadcast signed transactions from your own wallet tooling — nothing is sent by the API.',
    ],
  }
}
