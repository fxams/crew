import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { getConnection } from './agent/send.js'
import { acpChainId, acpEnabled } from './agent/platforms.js'
import { acpInProcessEnabled, getAcpListenerStatus } from './acp-inprocess.js'
import { readPlatformBuybackWallet } from './agent/constants.js'
import { query } from './db.js'
import { countKols } from './kols.js'
import { getProofBundle } from './proof.js'
import { listFeeAccrualCache } from './fee-accrual.js'
import { memoryJobs } from './jobs/store.js'
import { x402Ready } from './x402.js'

export type AgentChannel = 'acp' | 'mcp' | 'x402' | 'elizaos' | 'direct'

export function classifyAgentChannel(label: string | null | undefined): AgentChannel {
  const l = (label || '').trim().toLowerCase()
  if (l.includes('eliza')) return 'elizaos'
  if (l.includes('x402')) return 'x402'
  if (l.includes('acp') || l.includes('virtual')) return 'acp'
  return 'mcp'
}

export function emptyChannelCounts(): Record<AgentChannel, number> {
  return { acp: 0, mcp: 0, x402: 0, elizaos: 0, direct: 0 }
}

/** Site launches have no agent_key_id. x402 pay-per-call is not stored on coins, so it stays 0 unless a key is labeled x402. */
export function tallyLaunchChannels(
  rows: { label: string | null; agent_key_id: string | null; n: number }[],
): Record<AgentChannel, number> {
  const channels = emptyChannelCounts()
  for (const r of rows) {
    const n = Number(r.n || 0)
    if (!r.agent_key_id) {
      channels.direct += n
      continue
    }
    const ch = classifyAgentChannel(r.label)
    channels[ch] += n
  }
  return channels
}

function jobsEnabled(): boolean {
  const v = (process.env.JOBS_ENABLED || '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

async function treasuryBalanceSol(): Promise<number | null> {
  const wallet = readPlatformBuybackWallet()
  if (!wallet) return null
  try {
    const pk = new PublicKey(wallet)
    const lamports = await getConnection().getBalance(pk, 'confirmed')
    return Number((lamports / LAMPORTS_PER_SOL).toFixed(9))
  } catch {
    return null
  }
}

async function signupStats() {
  const [totalRows, dayRows] = await Promise.all([
    query<{ src: string; n: number }>(`
      SELECT COALESCE(NULLIF(trim(register_src), ''), 'direct') AS src,
             COUNT(*)::int AS n
      FROM kol_registrations
      GROUP BY 1
      ORDER BY n DESC
    `),
    query<{ src: string; n: number }>(`
      SELECT COALESCE(NULLIF(trim(register_src), ''), 'direct') AS src,
             COUNT(*)::int AS n
      FROM kol_registrations
      WHERE registered_at > now() - interval '24 hours'
      GROUP BY 1
      ORDER BY n DESC
    `),
  ])
  const bySrc = Object.fromEntries(totalRows.rows.map((r) => [String(r.src), Number(r.n || 0)]))
  const bySrc24h = Object.fromEntries(dayRows.rows.map((r) => [String(r.src), Number(r.n || 0)]))
  const total = totalRows.rows.reduce((s, r) => s + Number(r.n || 0), 0)
  const total24h = dayRows.rows.reduce((s, r) => s + Number(r.n || 0), 0)
  return { total, total24h, bySrc, bySrc24h }
}

async function roleActivity() {
  const [scout, poster, dm, monitor] = await Promise.all([
    query<{ at: Date | null }>(`SELECT max(launched_at) AS at FROM coins`),
    query<{ at: Date | null }>(`
      SELECT GREATEST(
        COALESCE((SELECT max(created_at) FROM kol_mention_drafts), 'epoch'::timestamptz),
        COALESCE((SELECT max(featured_x_at) FROM coins), 'epoch'::timestamptz)
      ) AS at
    `),
    query<{ at: Date | null }>(`
      SELECT max(registered_at) AS at
      FROM kol_registrations
      WHERE register_src = 'tg_bot' OR telegram_user_id IS NOT NULL
    `),
    query<{ at: Date | null }>(`SELECT max(created_at) AS at FROM buyback_runs`),
  ])
  const toMs = (d: Date | null | undefined) => (d ? new Date(d).getTime() : null)
  return {
    Scout: toMs(scout.rows[0]?.at),
    Poster: toMs(poster.rows[0]?.at),
    DM: toMs(dm.rows[0]?.at),
    Monitor: toMs(monitor.rows[0]?.at),
    You: null,
  }
}

async function flowWeights() {
  const windowDays = 30
  const { rows: launchRows } = await query<{ label: string | null; agent_key_id: string | null; n: number }>(
    `
    SELECT c.agent_key_id, ak.label, COUNT(*)::int AS n
    FROM coins c
    LEFT JOIN agent_keys ak ON ak.id = c.agent_key_id
    WHERE c.launched_at > now() - interval '30 days'
    GROUP BY c.agent_key_id, ak.label
    `,
  )

  const channels = tallyLaunchChannels(launchRows)

  const { rows: hireRows } = await query<{ hires: number; tasks: number }>(`
    SELECT
      (SELECT COUNT(*)::int FROM coin_crew cc
        INNER JOIN coins c ON c.mint = cc.mint
        WHERE c.launched_at > now() - interval '7 days') AS hires,
      0::int AS tasks
  `)
  let recentTasks = 0
  if (jobsEnabled()) {
    recentTasks = memoryJobs.listTasks().filter((j) => j.createdAt > Date.now() - 7 * 86_400_000).length
  }
  const recentHires = Number(hireRows[0]?.hires || 0)

  const crewSeats = await query<{ n: number }>(`
    SELECT COUNT(*)::int AS n FROM coin_crew cc
    INNER JOIN coins c ON c.mint = cc.mint
    WHERE c.fee_share_signature IS NOT NULL
  `)

  return {
    windowDays,
    channels,
    recentHires,
    recentTasks,
    kolCrewSeats: Number(crewSeats.rows[0]?.n || 0),
  }
}

async function liveLog(limit = 24) {
  const safe = Math.min(50, Math.max(5, limit))
  const events: { at: number; kind: string; text: string }[] = []

  const [launches, regs, remits, modes] = await Promise.all([
    query<{ ticker: string; mint: string; launched_at: Date }>(
      `SELECT ticker, mint, launched_at FROM coins ORDER BY launched_at DESC LIMIT $1`,
      [safe],
    ),
    query<{ x_username: string; register_src: string | null; registered_at: Date }>(
      `SELECT x_username, register_src, registered_at FROM kol_registrations ORDER BY registered_at DESC LIMIT $1`,
      [safe],
    ),
    query<{ handle: string; ticker: string; amount_sol: number; created_at: Date }>(
      `SELECT handle, ticker, amount_sol::float8 AS amount_sol, created_at
       FROM remits ORDER BY created_at DESC LIMIT $1`,
      [safe],
    ),
    query<{ kind: string; mint: string; created_at: Date }>(
      `SELECT kind, mint, created_at FROM mode_actions ORDER BY created_at DESC LIMIT $1`,
      [safe],
    ),
  ])

  for (const r of launches.rows) {
    events.push({
      at: new Date(r.launched_at).getTime(),
      kind: 'launch',
      text: `launch ${r.ticker} · ${r.mint.slice(0, 4)}…`,
    })
  }
  for (const r of regs.rows) {
    const src = r.register_src ? ` · ${r.register_src}` : ''
    events.push({
      at: new Date(r.registered_at).getTime(),
      kind: 'register',
      text: `register @${r.x_username}${src}`,
    })
  }
  for (const r of remits.rows) {
    events.push({
      at: new Date(r.created_at).getTime(),
      kind: 'hire',
      text: `remit ${r.handle} · ${Number(r.amount_sol).toFixed(4)} SOL · ${r.ticker}`,
    })
  }
  for (const r of modes.rows) {
    events.push({
      at: new Date(r.created_at).getTime(),
      kind: 'task',
      text: `mode ${r.kind} · ${r.mint.slice(0, 4)}…`,
    })
  }

  if (jobsEnabled()) {
    for (const j of memoryJobs.listTasks().slice(0, safe)) {
      events.push({
        at: j.createdAt,
        kind: 'task',
        text: `task ${j.status} · ${j.title || j.id}`,
      })
    }
  }

  return events.sort((a, b) => b.at - a.at).slice(0, safe)
}

function pendingFeesList() {
  const rows = listFeeAccrualCache()
    .filter((r) => (r.unclaimedSol != null && r.unclaimedSol > 0) || (r.unclaimedEth != null && r.unclaimedEth > 0))
    .sort((a, b) => (b.unclaimedSol || 0) - (a.unclaimedSol || 0))
    .slice(0, 20)
  return rows.map((r) => ({
    mint: r.mint,
    unclaimedSol: r.unclaimedSol,
    unclaimedEth: r.unclaimedEth,
    accruedSol: r.accruedSol,
    at: r.at,
    source: r.source,
  }))
}

function jobsEscrowSummary() {
  if (!jobsEnabled()) {
    return { enabled: false, open: [] as unknown[], counts: null }
  }
  const open = memoryJobs.listOpen().slice(0, 12).map((j) => ({
    id: j.id,
    status: j.status,
    mode: j.mode,
    title: j.mode === 'task' ? (j as { title?: string }).title : undefined,
    mint: j.mint,
    deadline: j.deadline,
    escrowRef: j.escrowRef,
  }))
  const seen = new Set<string>()
  const all = [...memoryJobs.listTasks(), ...memoryJobs.listOpen()].filter((j) => {
    if (seen.has(j.id)) return false
    seen.add(j.id)
    return true
  })
  const statuses = new Map<string, number>()
  for (const j of all) {
    statuses.set(j.status, (statuses.get(j.status) || 0) + 1)
  }
  return {
    enabled: true,
    open,
    counts: Object.fromEntries(statuses),
    rail: (process.env.JOBS_RAIL || 'sim').trim(),
  }
}

export async function buildAdminOpsSnapshot() {
  const [proof, registered, kolDirectory, signups, treasurySol, roles, flow, log] = await Promise.all([
    getProofBundle(40),
    query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM kol_registrations`),
    countKols(),
    signupStats(),
    treasuryBalanceSol(),
    roleActivity(),
    flowWeights(),
    liveLog(24),
  ])

  const roleTotals = proof.stats.byRole || []
  const crewSol = roleTotals.find((r) => r.role === 'crew')?.sol ?? null
  const deskSol = roleTotals.find((r) => r.role === 'desk')?.sol ?? null
  const platformSol = roleTotals.find((r) => r.role === 'platform')?.sol ?? null

  const acp = getAcpListenerStatus()

  return {
    ok: true,
    generatedAt: Date.now(),
    header: {
      totalFeesEarnedSol: proof.stats.remitSolTotal ?? null,
      kolPayoutsSol: crewSol,
      registeredKols: Number(registered.rows[0]?.n ?? 0),
      kolDirectorySize: kolDirectory,
      signupsTotal: signups.total,
      signups24h: signups.total24h,
      signupsBySrc: signups.bySrc,
      signupsBySrc24h: signups.bySrc24h,
      coinsLaunched: proof.stats.coins ?? null,
      feeShareLocked: proof.stats.feeShareLocked ?? null,
      custodialActions: 0,
    },
    roles: [
      { id: 'scout', label: 'Scout', lastActivityAt: roles.Scout },
      { id: 'poster', label: 'Poster', lastActivityAt: roles.Poster },
      { id: 'dm', label: 'DM', lastActivityAt: roles.DM },
      { id: 'monitor', label: 'Monitor', lastActivityAt: roles.Monitor },
      { id: 'you', label: 'You', lastActivityAt: roles.You },
    ],
    flow,
    money: {
      feeSplit: {
        crew60Sol: crewSol,
        desk15Sol: deskSol,
        treasury25Sol: platformSol,
        note: 'Totals from remit tape (fee-share locked coins).',
      },
      treasury: {
        wallet: readPlatformBuybackWallet() || null,
        balanceSol: treasurySol,
      },
      pendingFees: pendingFeesList(),
    },
    jobs: jobsEscrowSummary(),
    acp: {
      enabled: acpEnabled(),
      inProcess: acpInProcessEnabled(),
      chainId: acpEnabled() ? acpChainId() : null,
      listenerStarted: acp.started,
      x402Enabled: x402Ready(),
    },
    log,
  }
}
