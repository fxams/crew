import { randomBytes } from 'node:crypto'
import { query } from '../db.js'
import { creditProgramPoints } from './store.js'
import { pushNotification } from './notifications.js'

const BATTLE_HOURS = 24
const STAKE_BURN_BPS = 500 // 5%
const WEEKLY_TOP_BONUS = [300, 200, 100]

function id(prefix: string) {
  return `${prefix}_${randomBytes(6).toString('hex')}`
}

export function battleHashtag(battleId: string): string {
  const short = battleId.replace(/^cpb_/, '').slice(0, 8)
  return `#CPB${short}`
}

export type BattleRow = {
  id: string
  challengerHandle: string
  opponentHandle: string | null
  theme: string
  status: 'open' | 'active' | 'resolved'
  hashtag: string
  endsAt: string
  winnerHandle: string | null
  createdAt: string
}

export async function createBattle(opts: {
  challengerXUserId: string
  challengerHandle: string
  opponentHandle?: string | null
  theme: string
}): Promise<BattleRow> {
  const battleId = id('cpb')
  const ends = new Date(Date.now() + BATTLE_HOURS * 3600 * 1000)
  const opponent = opts.opponentHandle?.replace(/^@+/, '').trim() || null
  await query(
    `INSERT INTO kol_program_battles (
       id, challenger_x_user_id, challenger_handle, opponent_handle, theme, status, ends_at
     ) VALUES ($1,$2,$3,$4,$5,'active',$6)`,
    [battleId, opts.challengerXUserId, opts.challengerHandle, opponent, opts.theme.slice(0, 120), ends],
  )
  if (opponent) {
    const { rows } = await query<{ x_user_id: string }>(
      `SELECT x_user_id FROM kol_program_profiles WHERE lower(x_username) = lower($1)`,
      [opponent],
    )
    if (rows[0]?.x_user_id) {
      await pushNotification(
        rows[0].x_user_id,
        'battle_challenge',
        'KOL battle challenge',
        `@${opts.challengerHandle} challenged you: ${opts.theme}`,
        `/kol`,
      )
    }
  }
  return {
    id: battleId,
    challengerHandle: opts.challengerHandle,
    opponentHandle: opponent,
    theme: opts.theme,
    status: 'active',
    hashtag: battleHashtag(battleId),
    endsAt: ends.toISOString(),
    winnerHandle: null,
    createdAt: new Date().toISOString(),
  }
}

export async function stakeOnBattle(opts: {
  battleId: string
  xUserId: string
  handle: string
  side: 'challenger' | 'opponent'
  points: number
}): Promise<{ burned: number; staked: number }> {
  if (opts.points < 1 || opts.points > 5000) {
    throw new Error('Stake 1–5000 points.')
  }
  const burned = Math.floor((opts.points * STAKE_BURN_BPS) / 10_000)
  const net = opts.points - burned
  const { rows: prof } = await query<{ season_points: number }>(
    `SELECT season_points FROM kol_program_profiles WHERE x_user_id = $1`,
    [opts.xUserId],
  )
  if (!prof[0] || Number(prof[0].season_points) < opts.points) {
    throw new Error('Not enough season points to stake.')
  }
  await query(
    `UPDATE kol_program_profiles
     SET season_points = season_points - $2, total_points = total_points - $2, updated_at = now()
     WHERE x_user_id = $1`,
    [opts.xUserId, opts.points],
  )
  await query(
    `INSERT INTO kol_program_battle_stakes (id, battle_id, x_user_id, handle, side, points, burned_points)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id('cbs'), opts.battleId, opts.xUserId, opts.handle, opts.side, net, burned],
  )
  return { burned, staked: net }
}

/** Engagement rate = (likes+replies+reposts)/followers — verified from supplied metrics. */
export function pickBattleWinner(
  challenger: { handle: string; engagementRate: number },
  opponent: { handle: string; engagementRate: number },
): string {
  if (opponent.engagementRate > challenger.engagementRate) return opponent.handle
  if (challenger.engagementRate > opponent.engagementRate) return challenger.handle
  return challenger.handle
}

export async function resolveBattle(
  battleId: string,
  metrics: {
    challenger: { engagementRate: number }
    opponent: { engagementRate: number }
  },
): Promise<BattleRow | null> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT * FROM kol_program_battles WHERE id = $1 AND status = 'active'`,
    [battleId],
  )
  const b = rows[0]
  if (!b) return null
  const challengerHandle = String(b.challenger_handle)
  const opponentHandle = b.opponent_handle ? String(b.opponent_handle) : null
  if (!opponentHandle) return null

  const winner = pickBattleWinner(
    { handle: challengerHandle, engagementRate: metrics.challenger.engagementRate },
    { handle: opponentHandle, engagementRate: metrics.opponent.engagementRate },
  )

  await query(
    `UPDATE kol_program_battles SET status = 'resolved', winner_handle = $2, resolved_at = now() WHERE id = $1`,
    [battleId, winner],
  )

  const { rows: stakes } = await query<{ x_user_id: string; points: number; side: string }>(
    `SELECT x_user_id, points, side FROM kol_program_battle_stakes WHERE battle_id = $1`,
    [battleId],
  )
  const pool = stakes.reduce((s, r) => s + Number(r.points), 0)
  const winnerSide = winner.toLowerCase() === challengerHandle.toLowerCase() ? 'challenger' : 'opponent'
  const winners = stakes.filter((s) => s.side === winnerSide)
  if (pool > 0 && winners.length) {
    const share = Math.floor(pool / winners.length)
    for (const w of winners) {
      if (share > 0) await creditProgramPoints(w.x_user_id, share, `battle:win:${battleId}`)
    }
  }

  const notifyIds = new Set(stakes.map((s) => s.x_user_id))
  for (const uid of notifyIds) {
    await pushNotification(
      uid,
      'battle_result',
      'Battle resolved',
      `Winner @${winner} · ${battleHashtag(battleId)}`,
      `/kol`,
    )
  }

  await applyWeeklyBattleBonus()

  return {
    id: battleId,
    challengerHandle,
    opponentHandle,
    theme: String(b.theme),
    status: 'resolved',
    hashtag: battleHashtag(battleId),
    endsAt: new Date(b.ends_at as Date).toISOString(),
    winnerHandle: winner,
    createdAt: new Date(b.created_at as Date).toISOString(),
  }
}

async function applyWeeklyBattleBonus(): Promise<void> {
  const since = new Date(Date.now() - 7 * 86400000)
  const { rows } = await query<{ x_user_id: string; wins: string }>(
    `SELECT challenger_x_user_id AS x_user_id, COUNT(*)::text AS wins
     FROM kol_program_battles
     WHERE status = 'resolved' AND resolved_at >= $1
       AND winner_handle = challenger_handle
     GROUP BY challenger_x_user_id
     ORDER BY COUNT(*) DESC
     LIMIT 3`,
    [since],
  )
  for (let i = 0; i < rows.length && i < WEEKLY_TOP_BONUS.length; i++) {
    const bonus = WEEKLY_TOP_BONUS[i]
    await creditProgramPoints(rows[i].x_user_id, bonus, 'battle:weekly_top')
  }
}

export async function listActiveBattles(limit = 20): Promise<BattleRow[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT * FROM kol_program_battles WHERE status = 'active' ORDER BY created_at DESC LIMIT $1`,
    [limit],
  )
  return rows.map(mapBattle)
}

function mapBattle(b: Record<string, unknown>): BattleRow {
  return {
    id: String(b.id),
    challengerHandle: String(b.challenger_handle),
    opponentHandle: b.opponent_handle ? String(b.opponent_handle) : null,
    theme: String(b.theme),
    status: String(b.status) as BattleRow['status'],
    hashtag: battleHashtag(String(b.id)),
    endsAt: new Date(b.ends_at as Date).toISOString(),
    winnerHandle: b.winner_handle ? String(b.winner_handle) : null,
    createdAt: new Date(b.created_at as Date).toISOString(),
  }
}
