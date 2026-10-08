import type { PoolClient } from 'pg'
import { query, withTransaction } from './db.js'

export type ApiCrewMember = {
  handle: string
  wallet: string
  share: number
  hireRole?: string
}

export type ApiCoin = {
  id: string
  mint: string
  name: string
  ticker: string
  vibe: string
  mode: string
  crew: ApiCrewMember[]
  signature: string
  feeShareSignature?: string
  launchedAt: number
  launcher: string
  pumpUrl: string
  buybackRule?: unknown
  raidQuests?: unknown
  agent?: unknown
  holderKol?: boolean
  /** agent_keys.id that performed the launch (self-serve attribution). */
  agentKeyId?: string
}

export type ApiRemit = {
  id: string
  mint: string
  ticker: string
  handle: string
  wallet: string
  amountSol: number
  mode: string
  at: number
  signature?: string
  source?: string
}

function rowToCoin(row: Record<string, unknown>, crew: ApiCrewMember[]): ApiCoin {
  return {
    id: String(row.id),
    mint: String(row.mint),
    name: String(row.name),
    ticker: String(row.ticker),
    vibe: String(row.vibe || ''),
    mode: String(row.mode),
    crew,
    signature: String(row.signature || ''),
    feeShareSignature: row.fee_share_signature
      ? String(row.fee_share_signature)
      : undefined,
    launchedAt: new Date(String(row.launched_at)).getTime(),
    launcher: String(row.launcher),
    pumpUrl: String(row.pump_url),
    buybackRule: row.buyback_rule ?? undefined,
    raidQuests: row.raid_quests ?? undefined,
    agent: row.agent ?? undefined,
    holderKol: Boolean(row.holder_kol),
    agentKeyId: row.agent_key_id ? String(row.agent_key_id) : undefined,
  }
}

async function loadCrew(mint: string, client?: PoolClient): Promise<ApiCrewMember[]> {
  const q = client?.query.bind(client) ?? query
  const { rows } = await q<{
    handle: string
    wallet: string
    share: number
    hire_role: string | null
  }>(
    `SELECT handle, wallet, share, hire_role
     FROM coin_crew WHERE mint = $1 ORDER BY position ASC`,
    [mint],
  )
  return rows.map((r) => ({
    handle: r.handle,
    wallet: r.wallet,
    share: Number(r.share),
    hireRole: r.hire_role || undefined,
  }))
}

export async function listCoins(limit = 100): Promise<ApiCoin[]> {
  const { rows } = await query(
    `SELECT * FROM coins ORDER BY launched_at DESC LIMIT $1`,
    [Math.min(200, Math.max(1, limit))],
  )
  const out: ApiCoin[] = []
  for (const row of rows) {
    const crew = await loadCrew(String(row.mint))
    out.push(rowToCoin(row as Record<string, unknown>, crew))
  }
  return out
}

/** Launches attributed to a self-serve / operator agent key. */
export async function listCoinsByAgentKey(
  agentKeyId: string,
  limit = 50,
): Promise<ApiCoin[]> {
  const { rows } = await query(
    `SELECT * FROM coins WHERE agent_key_id = $1 ORDER BY launched_at DESC LIMIT $2`,
    [agentKeyId, Math.min(100, Math.max(1, limit))],
  )
  const out: ApiCoin[] = []
  for (const row of rows) {
    const crew = await loadCrew(String(row.mint))
    out.push(rowToCoin(row as Record<string, unknown>, crew))
  }
  return out
}

export async function getCoin(mint: string): Promise<ApiCoin | null> {
  const { rows } = await query(`SELECT * FROM coins WHERE mint = $1`, [mint])
  if (!rows[0]) return null
  const crew = await loadCrew(mint)
  return rowToCoin(rows[0] as Record<string, unknown>, crew)
}

export async function upsertCoin(coin: ApiCoin): Promise<ApiCoin> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO coins (
         mint, id, name, ticker, vibe, mode, signature, fee_share_signature,
         launched_at, launcher, pump_url, buyback_rule, raid_quests, agent, holder_kol,
         agent_key_id, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8, to_timestamp($9/1000.0), $10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16, now()
       )
       ON CONFLICT (mint) DO UPDATE SET
         id = EXCLUDED.id,
         name = EXCLUDED.name,
         ticker = EXCLUDED.ticker,
         vibe = EXCLUDED.vibe,
         mode = EXCLUDED.mode,
         signature = COALESCE(NULLIF(EXCLUDED.signature,''), coins.signature),
         fee_share_signature = COALESCE(EXCLUDED.fee_share_signature, coins.fee_share_signature),
         launched_at = EXCLUDED.launched_at,
         launcher = EXCLUDED.launcher,
         pump_url = EXCLUDED.pump_url,
         buyback_rule = EXCLUDED.buyback_rule,
         raid_quests = EXCLUDED.raid_quests,
         agent = EXCLUDED.agent,
         holder_kol = EXCLUDED.holder_kol,
         agent_key_id = COALESCE(EXCLUDED.agent_key_id, coins.agent_key_id),
         updated_at = now()`,
      [
        coin.mint,
        coin.id,
        coin.name,
        coin.ticker,
        coin.vibe || '',
        coin.mode,
        coin.signature || '',
        coin.feeShareSignature || null,
        coin.launchedAt,
        coin.launcher,
        coin.pumpUrl,
        coin.buybackRule ? JSON.stringify(coin.buybackRule) : null,
        coin.raidQuests ? JSON.stringify(coin.raidQuests) : null,
        coin.agent ? JSON.stringify(coin.agent) : null,
        Boolean(coin.holderKol),
        coin.agentKeyId || null,
      ],
    )

    await client.query(`DELETE FROM coin_crew WHERE mint = $1`, [coin.mint])
    for (const [i, m] of coin.crew.entries()) {
      await client.query(
        `INSERT INTO coin_crew (mint, position, handle, wallet, share, hire_role)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [coin.mint, i, m.handle, m.wallet, m.share, m.hireRole || null],
      )
    }
  })
  const saved = await getCoin(coin.mint)
  if (!saved) throw new Error('Failed to load coin after upsert')
  return saved
}

export async function listRemits(limit = 200): Promise<ApiRemit[]> {
  const { rows } = await query(
    `SELECT * FROM remits ORDER BY at DESC LIMIT $1`,
    [Math.min(500, Math.max(1, limit))],
  )
  return rows.map((r) => ({
    id: String(r.id),
    mint: String(r.mint),
    ticker: String(r.ticker),
    handle: String(r.handle),
    wallet: String(r.wallet || ''),
    amountSol: Number(r.amount_sol),
    mode: String(r.mode),
    at: new Date(String(r.at)).getTime(),
    signature: r.signature ? String(r.signature) : undefined,
    source: r.source ? String(r.source) : undefined,
  }))
}

export async function upsertRemits(remits: ApiRemit[]): Promise<number> {
  let n = 0
  for (const r of remits) {
    if (!(r.amountSol > 0) || !r.signature || !r.mint) continue
    // Ensure parent coin exists (minimal stub if missing)
    const existing = await getCoin(r.mint)
    if (!existing) {
      await upsertCoin({
        id: r.mint.slice(0, 12),
        mint: r.mint,
        name: r.ticker,
        ticker: r.ticker,
        vibe: '',
        mode: r.mode || 'split',
        crew: [],
        signature: r.signature,
        launchedAt: r.at || Date.now(),
        launcher: '',
        pumpUrl: `https://pump.fun/coin/${r.mint}`,
      })
    }
    const res = await query(
      `INSERT INTO remits (id, mint, ticker, handle, wallet, amount_sol, mode, at, signature, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7, to_timestamp($8/1000.0), $9, $10)
       ON CONFLICT (signature, wallet, handle) DO UPDATE SET
         amount_sol = EXCLUDED.amount_sol,
         at = EXCLUDED.at
       RETURNING id`,
      [
        r.id || `remit_${r.signature}_${r.wallet || 'x'}`,
        r.mint,
        r.ticker,
        r.handle,
        r.wallet || '',
        r.amountSol,
        r.mode || 'split',
        r.at || Date.now(),
        r.signature,
        r.source || 'chain',
      ],
    )
    if (res.rowCount) n += 1
  }
  return n
}
