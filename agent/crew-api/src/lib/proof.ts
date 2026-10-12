import { buybackStats, listBuybackRuns } from './buyback-exec.js'
import { isHouseHandle } from './agent/optout.js'
import { listCoins, listRemits, type ApiCoin, type ApiRemit } from './coins.js'
import { query } from './db.js'
import { countKols } from './kols.js'
import { isPlatformTreasury, readPlatformBuybackWallet } from './agent/constants.js'

/** Aggregate stats independent of list `limit` (avoids undercount when limit is small). */
async function proofAggregates() {
  const [{ rows: coinRows }, { rows: remitRows }, { rows: modeRows }, { rows: roleRows }] =
    await Promise.all([
    query<{ n: number; locked: number }>(
      `SELECT COUNT(*)::int AS n,
              COUNT(*)::int AS locked
       FROM coins
       WHERE fee_share_signature IS NOT NULL`,
    ),
    query<{ n: number; sol: number }>(
      `SELECT COUNT(*)::int AS n,
              COALESCE(SUM(r.amount_sol), 0)::float8 AS sol
       FROM remits r
       INNER JOIN coins c ON c.mint = r.mint AND c.fee_share_signature IS NOT NULL`,
    ),
      query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM mode_actions`),
      query<{ role: string | null; n: number; sol: number }>(`
        SELECT COALESCE(cs.role, 'unknown') AS role,
               COUNT(*)::int AS n,
               COALESCE(SUM(r.amount_sol), 0)::float8 AS sol
        FROM remits r
        INNER JOIN coins c ON c.mint = r.mint AND c.fee_share_signature IS NOT NULL
        LEFT JOIN coin_shareholders cs
          ON cs.mint = r.mint AND cs.wallet = r.wallet
        GROUP BY COALESCE(cs.role, 'unknown')
      `),
    ])
  const byRole = Object.fromEntries(
    roleRows.map((r) => [
      String(r.role || 'unknown'),
      { count: Number(r.n || 0), sol: Number(Number(r.sol || 0).toFixed(6)) },
    ]),
  ) as Record<string, { count: number; sol: number }>
  const humansPaidSol =
    (byRole['crew']?.sol || 0) + (byRole['kol']?.sol || 0) // 'kol' kept for older rows
  return {
    coins: Number(coinRows[0]?.n || 0),
    feeShareLocked: Number(coinRows[0]?.locked || 0),
    remitRows: Number(remitRows[0]?.n || 0),
    remitSolTotal: Number(Number(remitRows[0]?.sol || 0).toFixed(6)),
    modeActions: Number(modeRows[0]?.n || 0),
    byRole,
    humansPaidSol: Number(humansPaidSol.toFixed(6)),
  }
}

function agentDisplayHandle(coin: ApiCoin): string {
  const agent = coin.agent as { name?: string } | undefined
  const raw = (agent?.name || '').trim()
  if (raw.length >= 2) {
    const slug = raw.replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 24)
    if (slug.length >= 2) return `@${slug}`
  }
  return '@launcher'
}

/** Prefer crew / buyback / launcher labels over @xxxx address stubs. */
export function enrichRemitHandle(remit: ApiRemit, coin: ApiCoin | undefined, buybackWallet: string | null): string {
  if (coin) {
    const crewHit = coin.crew.find((c) => c.wallet === remit.wallet)
    if (crewHit?.handle) return crewHit.handle
    if (coin.launcher === remit.wallet) return agentDisplayHandle(coin)
  }
  if (isPlatformTreasury(remit.wallet)) return '@crew-buyback'
  const h = (remit.handle || '').trim()
  if (h === '@agent' || h === '@desk') {
    return coin?.launcher === remit.wallet ? agentDisplayHandle(coin) : h
  }
  // Expand bare 4-char stubs like @DKqE
  if (/^@[1-9A-HJ-NP-Za-km-z]{4}$/.test(h) || /^@[A-Za-z0-9]{1,4}$/.test(h)) {
    const w = remit.wallet
    if (w.length >= 8) return `@${w.slice(0, 4)}…${w.slice(-4)}`
  }
  return h || (remit.wallet.length >= 8 ? `@${remit.wallet.slice(0, 4)}…${remit.wallet.slice(-4)}` : h)
}

export type RoleTotals = {
  role: 'crew' | 'platform' | 'desk' | 'agent-referral' | 'referral' | 'unknown'
  remits: number
  sol: number
}

/** Filter to crew-only and build a scoreboard compatible with the site UI. */
export function buildCrewLeaderboardFromRemits(
  remits: Array<ApiRemit & { role?: string }>,
  limit = 8,
): { handle: string; totalSol: number; remits: number; tickers: string[] }[] {
  const map = new Map<string, { handle: string; totalSol: number; remits: number; tickers: string[] }>()
  for (const r of remits) {
    const role = (r.role || '').toLowerCase()
    if (role !== 'crew' && role !== 'kol') continue
    if (!r.handle) continue
    if (isHouseHandle(r.handle)) continue
    const key = r.handle.toLowerCase()
    const row =
      map.get(key) ??
      {
        handle: r.handle,
        totalSol: 0,
        remits: 0,
        tickers: [],
      }
    row.totalSol += r.amountSol || 0
    row.remits += 1
    if (r.ticker && !row.tickers.includes(r.ticker)) row.tickers.push(r.ticker)
    map.set(key, row)
  }
  return [...map.values()]
    .sort((a, b) => b.totalSol - a.totalSol || b.remits - a.remits)
    .slice(0, Math.max(1, Math.min(32, limit)))
}

function sumByRole(remits: Array<ApiRemit & { role?: string }>): RoleTotals[] {
  const sums = new Map<RoleTotals['role'], RoleTotals>()
  function add(role: RoleTotals['role'], amount: number) {
    const e = sums.get(role) ?? { role, remits: 0, sol: 0 }
    e.remits += 1
    e.sol += amount
    sums.set(role, e)
  }
  for (const r of remits) {
    const role = (r.role || 'unknown').toLowerCase() as RoleTotals['role']
    if (role === 'crew' || role === 'platform' || role === 'desk' || role === 'agent-referral' || role === 'referral') {
      add(role, r.amountSol || 0)
    } else {
      add('unknown', r.amountSol || 0)
    }
  }
  // Return in a stable order.
  const order: RoleTotals['role'][] = ['crew', 'desk', 'platform', 'agent-referral', 'referral', 'unknown']
  return order
    .map((k) => sums.get(k) ?? { role: k, remits: 0, sol: 0 })
}

export async function getProofBundle(limit = 40) {
  const safeLimit = Math.min(200, Math.max(1, limit))
  const [buybacks, buybackSummary, coins, remits, kolCount, modeActions, aggregates] =
    await Promise.all([
      listBuybackRuns(safeLimit),
      buybackStats(),
      listCoins(Math.min(50, safeLimit), { feeShareLockedOnly: true }),
      listRemits(safeLimit, { feeShareLockedOnly: true }),
      countKols(),
      listModeActions(safeLimit),
      proofAggregates(),
    ])

const buybackWallet = readPlatformBuybackWallet() || null
const coinsByMint = new Map(coins.map((c) => [c.mint, c]))
const classified = remits.map((r) => {
  const coin = coinsByMint.get(r.mint)
  let role = (r.role || '').toLowerCase() || null
  if (role === 'kol') role = 'crew'
  if (!role) {
    if (isPlatformTreasury(r.wallet)) role = 'platform'
    else if (coin?.crew.some((c) => c.wallet === r.wallet)) role = 'crew'
    else if (coin && coin.launcher === r.wallet) role = 'desk'
  }
  if (isPlatformTreasury(r.wallet)) role = 'platform'
  return {
    ...r,
    role: role ?? undefined,
    handle: enrichRemitHandle(r, coin, buybackWallet),
  }
})
const roleTotals = sumByRole(classified)

  return {
    ok: true,
    generatedAt: Date.now(),
    platform: {
      buybackWallet,
      crewMint:
        process.env.CREW_BUYBACK_MINT?.trim() ||
        process.env.VITE_CREW_MINT?.trim() ||
        null,
      kolDirectorySize: kolCount,
    },
    stats: {
      coins: aggregates.coins,
      feeShareLocked: aggregates.feeShareLocked,
      remitRows: aggregates.remitRows,
      remitSolTotal: aggregates.remitSolTotal,
      buybackRuns: buybackSummary.runs,
      buybackOkRuns: buybackSummary.okRuns,
      buybackSolSpent: buybackSummary.solSpentOk,
      modeActions: aggregates.modeActions,
      byRole: roleTotals,
      humansPaidSol: Number((roleTotals.find((r) => r.role === 'crew')?.sol ?? 0).toFixed(9)),
      humansPaidRemits: roleTotals.find((r) => r.role === 'crew')?.remits ?? 0,
    },
    buybacks,
    remits: classified.slice(0, safeLimit),
    leaderboard: buildCrewLeaderboardFromRemits(classified, 8),
    coins: coins.slice(0, 20).map((c) => ({
      mint: c.mint,
      ticker: c.ticker,
      name: c.name,
      mode: c.mode,
      feeShareLocked: Boolean(c.feeShareSignature),
      holderKol: Boolean(c.holderKol),
      unlockedExpired: Boolean(c.unlockedExpired),
      adminRevoked: c.adminRevoked,
      launchedAt: c.launchedAt,
      pumpUrl: c.pumpUrl,
      launcher: c.launcher,
      platform: c.platform || 'pumpfun',
    })),
    modeActions,
  }
}

export async function listModeActions(limit = 40) {
  const { rows } = await query(
    `SELECT id, mint, mode, kind, amount_sol::float8 AS amount_sol, wallet, handle, signature, detail, created_at
     FROM mode_actions
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.min(200, Math.max(1, limit))],
  )
  return rows.map((r) => ({
    id: String(r.id),
    mint: String(r.mint),
    mode: String(r.mode),
    kind: String(r.kind),
    amountSol: Number(r.amount_sol),
    wallet: String(r.wallet || ''),
    handle: String(r.handle || ''),
    signature: String(r.signature),
    detail: r.detail ? String(r.detail) : null,
    at: new Date(String(r.created_at)).getTime(),
  }))
}

export async function recordModeAction(row: {
  id: string
  mint: string
  mode: string
  kind: string
  amountSol: number
  wallet?: string
  handle?: string
  signature: string
  detail?: string
}) {
  await query(
    `INSERT INTO mode_actions (id, mint, mode, kind, amount_sol, wallet, handle, signature, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [
      row.id,
      row.mint,
      row.mode,
      row.kind,
      row.amountSol,
      row.wallet || '',
      row.handle || '',
      row.signature,
      row.detail || null,
    ],
  )
}
