import { buybackStats, listBuybackRuns } from './buyback-exec.js'
import { listCoins, listRemits } from './coins.js'
import { query } from './db.js'
import { countKols } from './kols.js'
import { readPlatformBuybackWallet } from './agent/constants.js'

export async function getProofBundle(limit = 40) {
  const [buybacks, buybackSummary, coins, remits, kolCount, modeActions] = await Promise.all([
    listBuybackRuns(limit),
    buybackStats(),
    listCoins(Math.min(50, limit)),
    listRemits(limit),
    countKols(),
    listModeActions(limit),
  ])

  const remitSol = remits.reduce((s, r) => s + (Number(r.amountSol) || 0), 0)
  const locked = coins.filter((c) => c.feeShareSignature).length

  return {
    ok: true,
    generatedAt: Date.now(),
    platform: {
      buybackWallet: readPlatformBuybackWallet() || null,
      crewMint:
        process.env.CREW_BUYBACK_MINT?.trim() ||
        process.env.VITE_CREW_MINT?.trim() ||
        null,
      kolDirectorySize: kolCount,
    },
    stats: {
      coins: coins.length,
      feeShareLocked: locked,
      remitRows: remits.length,
      remitSolTotal: Number(remitSol.toFixed(6)),
      buybackRuns: buybackSummary.runs,
      buybackOkRuns: buybackSummary.okRuns,
      buybackSolSpent: buybackSummary.solSpentOk,
      modeActions: modeActions.length,
    },
    buybacks,
    remits: remits.slice(0, limit),
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
