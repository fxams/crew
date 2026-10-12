import type { PoolClient } from 'pg'
import { query, withTransaction } from './db.js'
import {
  inferLaunchPlatformFromCoin,
  type LaunchPlatform,
} from './agent/platforms.js'
import { shouldMarkUnlockedExpired } from './agent/fee-lock-integrity.js'

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
  /** holderKol unlocked ≥24h — do not count toward proof/leaderboards/referral. */
  unlockedExpired?: boolean
  /** On-chain sharing-config adminRevoked after fee-share lock. */
  adminRevoked?: boolean
  /** agent_keys.id that performed the launch (self-serve attribution). */
  agentKeyId?: string
  /** Launch venue inferred from trade URL / mint (pumpfun default). */
  platform?: LaunchPlatform
  /** @CrewPayHQ status URL, set by admin/API after an external post. */
  featuredXUrl?: string
  featuredXAt?: number
  featuredXSetBy?: string
  /** First time CrewPay observed Pump.fun graduation. */
  graduatedAt?: number
  graduatedVia?: string
}

export type ListCoinsOpts = {
  /** When true, omit coins with null fee_share_signature (holderKol / HTTP 202). */
  feeShareLockedOnly?: boolean
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
  /** Canonical attribution role for this remit recipient on the given mint. */
  role?: string
}

function rowToCoin(row: Record<string, unknown>, crew: ApiCrewMember[]): ApiCoin {
  const launchedAt = new Date(String(row.launched_at)).getTime()
  const feeShareSignature = row.fee_share_signature
    ? String(row.fee_share_signature)
    : undefined
  const holderKol = Boolean(row.holder_kol)
  const unlockedExpired =
    Boolean(row.unlocked_expired) ||
    shouldMarkUnlockedExpired({
      holderKol,
      feeShareSignature,
      launchedAt,
      unlockedExpired: Boolean(row.unlocked_expired),
    })
  return {
    id: String(row.id),
    mint: String(row.mint),
    name: String(row.name),
    ticker: String(row.ticker),
    vibe: String(row.vibe || ''),
    mode: String(row.mode),
    crew,
    signature: String(row.signature || ''),
    feeShareSignature,
    launchedAt,
    launcher: String(row.launcher),
    pumpUrl: String(row.pump_url),
    buybackRule: row.buyback_rule ?? undefined,
    raidQuests: row.raid_quests ?? undefined,
    agent: row.agent ?? undefined,
    holderKol,
    unlockedExpired,
    adminRevoked: row.admin_revoked == null ? undefined : Boolean(row.admin_revoked),
    agentKeyId: row.agent_key_id ? String(row.agent_key_id) : undefined,
    platform: inferLaunchPlatformFromCoin({
      pumpUrl: String(row.pump_url || ''),
      mint: String(row.mint || ''),
    }),
    featuredXUrl: row.featured_x_url ? String(row.featured_x_url) : undefined,
    featuredXAt: row.featured_x_at ? new Date(String(row.featured_x_at)).getTime() : undefined,
    featuredXSetBy: row.featured_x_set_by ? String(row.featured_x_set_by) : undefined,
    graduatedAt: row.graduated_at ? new Date(String(row.graduated_at)).getTime() : undefined,
    graduatedVia: row.graduated_via ? String(row.graduated_via) : undefined,
  }
}

/** Persist unlocked_expired when holderKol has been open ≥24h. */
async function syncUnlockedExpired(coin: ApiCoin): Promise<ApiCoin> {
  if (!shouldMarkUnlockedExpired({ ...coin, unlockedExpired: false })) {
    return coin
  }
  try {
    await query(
      `UPDATE coins
       SET unlocked_expired = true, updated_at = now()
       WHERE mint = $1
         AND holder_kol = true
         AND fee_share_signature IS NULL
         AND unlocked_expired IS DISTINCT FROM true`,
      [coin.mint],
    )
  } catch {
    /* best-effort — column may not exist until migrate 018 */
  }
  return { ...coin, unlockedExpired: true }
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

export async function listCoins(
  limit = 100,
  opts?: ListCoinsOpts,
): Promise<ApiCoin[]> {
  const lockedOnly = Boolean(opts?.feeShareLockedOnly)
  const { rows } = await query(
    lockedOnly
      ? `SELECT * FROM coins
         WHERE fee_share_signature IS NOT NULL
         ORDER BY launched_at DESC LIMIT $1`
      : `SELECT * FROM coins ORDER BY launched_at DESC LIMIT $1`,
    [Math.min(200, Math.max(1, limit))],
  )
  const out: ApiCoin[] = []
  for (const row of rows) {
    const crew = await loadCrew(String(row.mint))
    out.push(await syncUnlockedExpired(rowToCoin(row as Record<string, unknown>, crew)))
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
    out.push(await syncUnlockedExpired(rowToCoin(row as Record<string, unknown>, crew)))
  }
  return out
}

export async function getCoin(mint: string): Promise<ApiCoin | null> {
  const { rows } = await query(`SELECT * FROM coins WHERE mint = $1`, [mint])
  if (!rows[0]) return null
  const crew = await loadCrew(mint)
  return syncUnlockedExpired(rowToCoin(rows[0] as Record<string, unknown>, crew))
}

export async function upsertCoin(coin: ApiCoin): Promise<ApiCoin> {
  const unlockedExpired = Boolean(coin.feeShareSignature)
    ? false
    : shouldMarkUnlockedExpired(coin) || Boolean(coin.unlockedExpired)
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO coins (
         mint, id, name, ticker, vibe, mode, signature, fee_share_signature,
         launched_at, launcher, pump_url, buyback_rule, raid_quests, agent, holder_kol,
         unlocked_expired, admin_revoked, agent_key_id, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8, to_timestamp($9/1000.0), $10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16,$17,$18, now()
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
         unlocked_expired = CASE
           WHEN COALESCE(EXCLUDED.fee_share_signature, coins.fee_share_signature) IS NOT NULL THEN false
           ELSE EXCLUDED.unlocked_expired OR coins.unlocked_expired
         END,
         admin_revoked = COALESCE(EXCLUDED.admin_revoked, coins.admin_revoked),
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
        unlockedExpired,
        coin.adminRevoked == null ? null : Boolean(coin.adminRevoked),
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

export async function listRemits(
  limit = 200,
  opts?: { mint?: string; feeShareLockedOnly?: boolean },
): Promise<ApiRemit[]> {
  const safeLimit = Math.min(500, Math.max(1, limit))
  const mint = opts?.mint?.trim()
  const lockedOnly = Boolean(opts?.feeShareLockedOnly)
  const lockJoin = lockedOnly
    ? 'INNER JOIN coins c ON c.mint = r.mint AND c.fee_share_signature IS NOT NULL'
    : ''
  // Join shareholder role for attribution. A wallet may have multiple rows in
  // coin_shareholders for a mint historically, but normalization ensures there
  // is at most one canonical role per wallet (crew/platform/desk/agent-referral).
  const { rows } = mint
    ? await query(
        `SELECT r.*, cs.role
         FROM remits r
         LEFT JOIN coin_shareholders cs
           ON cs.mint = r.mint AND cs.wallet = r.wallet
         ${lockJoin}
         WHERE r.mint = $1
         ORDER BY r.at DESC
         LIMIT $2`,
        [mint, safeLimit],
      )
    : await query(
        `SELECT r.*, cs.role
         FROM remits r
         LEFT JOIN coin_shareholders cs
           ON cs.mint = r.mint AND cs.wallet = r.wallet
         ${lockJoin}
         ORDER BY r.at DESC
         LIMIT $1`,
        [safeLimit],
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
    role: r.role ? String(r.role) : undefined,
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
