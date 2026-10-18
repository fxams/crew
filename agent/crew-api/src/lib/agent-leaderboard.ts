/** Launching-agent (role desk, 15%) leaderboard from proof remits + launches. Real tape only. */

import { query } from './db.js'
import {
  inferLaunchPlatformFromCoin,
  isEvmLaunchPlatform,
  type LaunchPlatform,
} from './agent/platforms.js'
import { MODE_DESK_BPS } from './agent/constants.js'

export const AGENT_LEADERBOARD_DISCLAIMER =
  'Creator fees follow trading volume and can be zero. Totals are cranked on-chain remits with role desk (15% launching agent) — not projected earnings.'

export type AgentLeaderboardIdentity = {
  agentName?: string | null
  xHandle?: string | null
}

export type AgentLeaderboardCoin = {
  mint: string
  launcher: string
  platform?: string | null
  pumpUrl?: string | null
  agent?: unknown
  agentKeyId?: string | null
}

export type AgentLeaderboardRemit = {
  mint: string
  wallet: string
  amountSol: number
  at: number
  signature?: string
  role?: string | null
  handle?: string | null
}

export type AgentLeaderboardRow = {
  rank: number
  wallet: string
  agentName: string | null
  xHandle: string | null
  coinsLaunched: number
  earnedSol: number
  earnedEth: number
  lastPayoutAt: number | null
  lastPayoutSignature: string | null
  lastPayoutMint: string | null
}

export type AgentEarnedOnCoin = {
  wallet: string
  agentName: string | null
  xHandle: string | null
  earnedSol: number
  earnedEth: number
  lastPayoutAt: number | null
  lastPayoutSignature: string | null
  remitCount: number
}

export type AgentLeaderboardBundle = {
  ok: true
  generatedAt: number
  role: 'desk'
  shareBps: number
  source: 'proof remits + launches'
  disclaimer: string
  empty: boolean
  emptyReason: string | null
  rows: AgentLeaderboardRow[]
}

export function isDeskRemit(opts: {
  role?: string | null
  wallet: string
  launcher?: string | null
}): boolean {
  const role = (opts.role || '').toLowerCase()
  if (role === 'desk') return true
  if (role === 'crew' || role === 'kol' || role === 'platform' || role === 'agent-referral' || role === 'referral') {
    return false
  }
  const wallet = (opts.wallet || '').trim()
  const launcher = (opts.launcher || '').trim()
  return Boolean(wallet && launcher && wallet === launcher)
}

export function parseAgentName(agent: unknown): string | null {
  if (!agent || typeof agent !== 'object') return null
  const raw = String((agent as { name?: unknown }).name || '').trim()
  if (raw.length < 2) return null
  return raw.slice(0, 48)
}

export function remitAsset(coin: Pick<AgentLeaderboardCoin, 'platform' | 'pumpUrl' | 'mint'>): 'sol' | 'eth' {
  const platform: LaunchPlatform = inferLaunchPlatformFromCoin({
    platform: coin.platform,
    pumpUrl: coin.pumpUrl,
    mint: coin.mint,
  })
  return isEvmLaunchPlatform(platform) ? 'eth' : 'sol'
}

function roundAmt(n: number): number {
  return Number(n.toFixed(9))
}

export function buildAgentLeaderboard(opts: {
  remits: AgentLeaderboardRemit[]
  coins: AgentLeaderboardCoin[]
  identities?: Record<string, AgentLeaderboardIdentity>
  limit?: number
}): AgentLeaderboardBundle {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20))
  const coinsByMint = new Map(opts.coins.map((c) => [c.mint, c]))
  const launched = new Map<string, number>()
  for (const c of opts.coins) {
    const w = (c.launcher || '').trim()
    if (!w) continue
    launched.set(w, (launched.get(w) || 0) + 1)
  }

  type Acc = {
    wallet: string
    earnedSol: number
    earnedEth: number
    lastPayoutAt: number | null
    lastPayoutSignature: string | null
    lastPayoutMint: string | null
    agentName: string | null
  }
  const byWallet = new Map<string, Acc>()

  for (const r of opts.remits) {
    const coin = coinsByMint.get(r.mint)
    if (!isDeskRemit({ role: r.role, wallet: r.wallet, launcher: coin?.launcher })) continue
    const amount = Number(r.amountSol)
    if (!(amount > 0)) continue
    const wallet = r.wallet.trim()
    if (!wallet) continue
    const acc =
      byWallet.get(wallet) ??
      {
        wallet,
        earnedSol: 0,
        earnedEth: 0,
        lastPayoutAt: null,
        lastPayoutSignature: null,
        lastPayoutMint: null,
        agentName: null,
      }
    const asset = coin ? remitAsset(coin) : 'sol'
    if (asset === 'eth') acc.earnedEth += amount
    else acc.earnedSol += amount
    const at = Number(r.at) || 0
    if (at && (!acc.lastPayoutAt || at > acc.lastPayoutAt)) {
      acc.lastPayoutAt = at
      acc.lastPayoutSignature = r.signature || null
      acc.lastPayoutMint = r.mint
    }
    if (!acc.agentName) {
      acc.agentName = parseAgentName(coin?.agent) || null
    }
    byWallet.set(wallet, acc)
  }

  const rows: AgentLeaderboardRow[] = [...byWallet.values()]
    .map((acc) => {
      const id = opts.identities?.[acc.wallet]
      return {
        rank: 0,
        wallet: acc.wallet,
        agentName: id?.agentName || acc.agentName,
        xHandle: id?.xHandle ? id.xHandle.replace(/^@+/, '') : null,
        coinsLaunched: launched.get(acc.wallet) || 0,
        earnedSol: roundAmt(acc.earnedSol),
        earnedEth: roundAmt(acc.earnedEth),
        lastPayoutAt: acc.lastPayoutAt,
        lastPayoutSignature: acc.lastPayoutSignature,
        lastPayoutMint: acc.lastPayoutMint,
      }
    })
    .sort(
      (a, b) =>
        b.earnedSol - a.earnedSol ||
        b.earnedEth - a.earnedEth ||
        b.coinsLaunched - a.coinsLaunched ||
        (b.lastPayoutAt || 0) - (a.lastPayoutAt || 0),
    )
    .slice(0, limit)
    .map((row, i) => ({ ...row, rank: i + 1 }))

  const empty = rows.length === 0
  return {
    ok: true,
    generatedAt: Date.now(),
    role: 'desk',
    shareBps: MODE_DESK_BPS.agent,
    source: 'proof remits + launches',
    disclaimer: AGENT_LEADERBOARD_DISCLAIMER,
    empty,
    emptyReason: empty
      ? 'No role=desk remits on the proof tape yet. When coins trade and fees are cranked, launching-agent payouts show up here.'
      : null,
    rows,
  }
}

export function agentEarnedForMint(opts: {
  mint: string
  remits: AgentLeaderboardRemit[]
  coin: AgentLeaderboardCoin | null
  identity?: AgentLeaderboardIdentity
}): AgentEarnedOnCoin | null {
  if (!opts.coin) return null
  const desk = opts.remits.filter(
    (r) =>
      r.mint === opts.mint &&
      isDeskRemit({ role: r.role, wallet: r.wallet, launcher: opts.coin?.launcher }) &&
      Number(r.amountSol) > 0,
  )
  if (!desk.length) return null
  const asset = remitAsset(opts.coin)
  let earnedSol = 0
  let earnedEth = 0
  let last = desk[0]!
  for (const r of desk) {
    if (asset === 'eth') earnedEth += Number(r.amountSol)
    else earnedSol += Number(r.amountSol)
    if ((r.at || 0) > (last.at || 0)) last = r
  }
  return {
    wallet: last.wallet,
    agentName: opts.identity?.agentName || parseAgentName(opts.coin.agent),
    xHandle: opts.identity?.xHandle ? opts.identity.xHandle.replace(/^@+/, '') : null,
    earnedSol: roundAmt(earnedSol),
    earnedEth: roundAmt(earnedEth),
    lastPayoutAt: last.at || null,
    lastPayoutSignature: last.signature || null,
    remitCount: desk.length,
  }
}

type RemitRow = {
  mint: string
  wallet: string
  amount_sol: number
  at: Date | string
  signature: string | null
  role: string | null
  handle: string | null
}

type CoinRow = {
  mint: string
  launcher: string
  pump_url: string | null
  agent: unknown
  agent_key_id: string | null
}

async function loadIdentities(wallets: string[], coins: CoinRow[]): Promise<Record<string, AgentLeaderboardIdentity>> {
  const out: Record<string, AgentLeaderboardIdentity> = {}
  for (const w of wallets) out[w] = {}

  for (const c of coins) {
    const w = (c.launcher || '').trim()
    if (!w || !out[w]) continue
    const name = parseAgentName(c.agent)
    if (name && !out[w].agentName) out[w].agentName = name
  }

  const keyIds = [...new Set(coins.map((c) => c.agent_key_id).filter((id): id is string => Boolean(id)))]
  if (keyIds.length) {
    try {
      const { rows } = await query<{ id: string; label: string }>(
        `SELECT id, label FROM agent_keys WHERE id = ANY($1::text[])`,
        [keyIds],
      )
      const labelById = new Map(rows.map((r) => [String(r.id), String(r.label || '').trim()]))
      for (const c of coins) {
        const w = (c.launcher || '').trim()
        const label = c.agent_key_id ? labelById.get(c.agent_key_id) : ''
        if (w && out[w] && !out[w].agentName && label && label.length >= 2) {
          out[w].agentName = label.slice(0, 48)
        }
      }
    } catch {
      /* agent_keys optional */
    }
  }

  if (wallets.length) {
    try {
      const { rows } = await query<{ wallet: string; evm_wallet: string | null; x_username: string }>(
        `SELECT wallet, evm_wallet, x_username FROM kol_registrations
         WHERE wallet = ANY($1::text[]) OR evm_wallet = ANY($1::text[])`,
        [wallets],
      )
      for (const r of rows) {
        const handle = String(r.x_username || '').replace(/^@+/, '')
        if (!handle) continue
        for (const key of [r.wallet, r.evm_wallet]) {
          const w = String(key || '').trim()
          if (w && out[w] && !out[w].xHandle) out[w].xHandle = handle
        }
      }
    } catch {
      /* registrations optional */
    }
  }

  return out
}

export async function getAgentLeaderboard(limit = 20): Promise<AgentLeaderboardBundle> {
  const [{ rows: remitRows }, { rows: coinRows }] = await Promise.all([
    query<RemitRow>(
      `SELECT r.mint, r.wallet, r.amount_sol::float8 AS amount_sol, r.at, r.signature, r.handle,
              cs.role
       FROM remits r
       INNER JOIN coins c ON c.mint = r.mint AND c.fee_share_signature IS NOT NULL
       LEFT JOIN coin_shareholders cs ON cs.mint = r.mint AND cs.wallet = r.wallet
       WHERE r.amount_sol > 0`,
    ),
    query<CoinRow>(
      `SELECT mint, launcher, pump_url, agent, agent_key_id
       FROM coins
       WHERE fee_share_signature IS NOT NULL`,
    ),
  ])

  const coins: AgentLeaderboardCoin[] = coinRows.map((c) => ({
    mint: String(c.mint),
    launcher: String(c.launcher || ''),
    pumpUrl: c.pump_url ? String(c.pump_url) : null,
    agent: c.agent,
    agentKeyId: c.agent_key_id ? String(c.agent_key_id) : null,
  }))
  const remits: AgentLeaderboardRemit[] = remitRows.map((r) => ({
    mint: String(r.mint),
    wallet: String(r.wallet || ''),
    amountSol: Number(r.amount_sol),
    at: new Date(String(r.at)).getTime(),
    signature: r.signature ? String(r.signature) : undefined,
    role: r.role ? String(r.role) : null,
    handle: r.handle ? String(r.handle) : null,
  }))
  const wallets = [...new Set([...remits.map((r) => r.wallet), ...coins.map((c) => c.launcher)].filter(Boolean))]
  const identities = await loadIdentities(wallets, coinRows)
  return buildAgentLeaderboard({ remits, coins, identities, limit })
}

export async function getAgentEarnedForMint(mint: string): Promise<AgentEarnedOnCoin | null> {
  const m = mint.trim()
  if (!m) return null
  const [{ rows: remitRows }, { rows: coinRows }] = await Promise.all([
    query<RemitRow>(
      `SELECT r.mint, r.wallet, r.amount_sol::float8 AS amount_sol, r.at, r.signature, r.handle,
              cs.role
       FROM remits r
       LEFT JOIN coin_shareholders cs ON cs.mint = r.mint AND cs.wallet = r.wallet
       WHERE r.mint = $1 AND r.amount_sol > 0`,
      [m],
    ),
    query<CoinRow>(
      `SELECT mint, launcher, pump_url, agent, agent_key_id
       FROM coins WHERE mint = $1`,
      [m],
    ),
  ])
  const coinRow = coinRows[0]
  if (!coinRow) return null
  const coin: AgentLeaderboardCoin = {
    mint: String(coinRow.mint),
    launcher: String(coinRow.launcher || ''),
    pumpUrl: coinRow.pump_url ? String(coinRow.pump_url) : null,
    agent: coinRow.agent,
    agentKeyId: coinRow.agent_key_id ? String(coinRow.agent_key_id) : null,
  }
  const remits: AgentLeaderboardRemit[] = remitRows.map((r) => ({
    mint: String(r.mint),
    wallet: String(r.wallet || ''),
    amountSol: Number(r.amount_sol),
    at: new Date(String(r.at)).getTime(),
    signature: r.signature ? String(r.signature) : undefined,
    role: r.role ? String(r.role) : null,
  }))
  const identities = await loadIdentities([coin.launcher].filter(Boolean), coinRows)
  return agentEarnedForMint({ mint: m, remits, coin, identity: identities[coin.launcher] })
}
