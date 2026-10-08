import { buybackStats, listBuybackRuns } from './buyback-exec.js'
import { listCoins, listRemits, type ApiCoin, type ApiRemit } from './coins.js'
import { query } from './db.js'
import { countKols } from './kols.js'
import { readPlatformBuybackWallet } from './agent/constants.js'

/** Aggregate stats independent of list `limit` (avoids undercount when limit is small). */
async function proofAggregates() {
  const [{ rows: coinRows }, { rows: remitRows }, { rows: modeRows }] = await Promise.all([
    query<{ n: number; locked: number }>(
      `SELECT COUNT(*)::int AS n,
              COUNT(fee_share_signature)::int AS locked
       FROM coins`,
    ),
    query<{ n: number; sol: number }>(
      `SELECT COUNT(*)::int AS n,
              COALESCE(SUM(amount_sol), 0)::float8 AS sol
       FROM remits`,
    ),
    query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM mode_actions`),
  ])
  return {
    coins: Number(coinRows[0]?.n || 0),
    feeShareLocked: Number(coinRows[0]?.locked || 0),
    remitRows: Number(remitRows[0]?.n || 0),
    remitSolTotal: Number(Number(remitRows[0]?.sol || 0).toFixed(6)),
    modeActions: Number(modeRows[0]?.n || 0),
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
  if (buybackWallet && remit.wallet === buybackWallet) return '@crew-buyback'
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

export async function getProofBundle(limit = 40) {
  const safeLimit = Math.min(200, Math.max(1, limit))
  const [buybacks, buybackSummary, coins, remits, kolCount, modeActions, aggregates] =
    await Promise.all([
      listBuybackRuns(safeLimit),
      buybackStats(),
      listCoins(Math.min(50, safeLimit)),
      listRemits(safeLimit),
      countKols(),
      listModeActions(safeLimit),
      proofAggregates(),
    ])

  const buybackWallet = readPlatformBuybackWallet() || null
  const coinsByMint = new Map(coins.map((c) => [c.mint, c]))

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
    },
    buybacks,
    remits: remits.slice(0, safeLimit).map((r) => ({
      ...r,
      handle: enrichRemitHandle(r, coinsByMint.get(r.mint), buybackWallet),
    })),
    coins: coins.slice(0, 20).map((c) => ({
      mint: c.mint,
      ticker: c.ticker,
      name: c.name,
      mode: c.mode,
      feeShareLocked: Boolean(c.feeShareSignature),
      holderKol: Boolean(c.holderKol),
      launchedAt: c.launchedAt,
      pumpUrl: c.pumpUrl,
      launcher: c.launcher,
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
