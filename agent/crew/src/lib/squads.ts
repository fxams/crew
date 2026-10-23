import { formatUtc } from './format-utc'
import { shortAddr } from './wallet'

export const SQUADS_DASHBOARD_URL = 'upstream-feed
export const SQUADS_COPY_URL = 'upstream-feed
export const SQUADS_METHODOLOGY_URL = 'upstream-feed
export const SQUADS_DISPUTE_CONTACT = 'crewpay@mail.grokbot.com'
export const SQUADS_DISCLAIMER_FALLBACK =
  'Automated statistical analysis of public on-chain data. Indicates unusual trading patterns only, not proof of wrongdoing or an accusation against any person or squad. May contain errors.'
export const SQUADS_PRESTART_BADGE = 'pre-start, not contest PnL'
export const SQUADS_COLLECTING = 'collecting data'
export const SQUADS_LIVE_COPY_NOTE = 'Live copy coming later'
export const SQUADS_STALE_MS = 30 * 60 * 1000
export const SQUADS_DEFAULT_REFRESH_MS = 10 * 60 * 1000
export const SQUADS_LOCAL_KILL_KEY = 'crew.squads.kill'

export type SquadsStatus = 'pre-start' | 'live' | 'ended' | string

export type SquadMomentumWindow = {
  pnl_change_usd?: number | null
  rank_change?: number | null
  baseline?: number | null
}

export type SquadMomentum = {
  '1h'?: SquadMomentumWindow | null
  '6h'?: SquadMomentumWindow | null
  '24h'?: SquadMomentumWindow | null
  source?: string | null
  note?: string | null
  gap_to_top3_usd?: number | null
}

export type SquadMember = {
  wallet?: string | null
  username?: string | null
  x_handle?: string | null
  pnl_usd?: number | null
  pnl_source?: string | null
}

export type SquadAnomalyFlag = {
  type?: string | null
  token?: string | null
  wallets?: string[] | null
  score?: number | null
  evidence?: Record<string, unknown> | null
  label?: string | null
}

export type SquadAnomaly = {
  anomaly_score?: number | null
  anomaly_rank?: number | null
  anomaly_flags?: SquadAnomalyFlag[] | null
  flag_count?: number | null
}

export type SquadOpenPosition = {
  mint?: string | null
  symbol?: string | null
  chain?: string | null
  graduated?: boolean | null
  trades?: number | null
  entry_ts?: string | number | null
  avg_entry_usd?: number | null
  buy_spend_usd?: number | null
  sold_usd?: number | null
  tokens_held?: number | null
  cost_basis_usd?: number | null
  current_value_usd?: number | null
  upnl_usd?: number | null
  realized_usd?: number | null
  mark_price_usd?: number | null
  mark_ts?: string | null
  mark_note?: string | null
  holders_in_squad?: string[] | null
  holders_count?: number | null
  supply_share_pct?: number | null
  liquidatable_value_usd?: number | null
  liquidation_note?: string | null
  buyer_depth_24h?: number | null
}

export type SquadClosedPosition = {
  mint?: string | null
  symbol?: string | null
  chain?: string | null
  graduated?: boolean | null
  trades?: number | null
  entry_ts?: string | number | null
  avg_entry_usd?: number | null
  buy_spend_usd?: number | null
  sold_usd?: number | null
  realized_usd?: number | null
  avg_exit_usd?: number | null
  exit_ts?: string | number | null
  hold_min?: number | null
}

export type SquadTradeMark = {
  mint?: string | null
  symbol?: string | null
  realized_usd?: number | null
}

export type SquadTradeStats = {
  source?: string | null
  closed_positions?: number | null
  win_rate?: number | null
  avg_hold_min?: number | null
  median_hold_min?: number | null
  best_trade?: SquadTradeMark | null
  worst_trade?: SquadTradeMark | null
  buys?: number | null
  avg_bet_sol?: number | null
  median_bet_sol?: number | null
}

export type SquadWalletAgeRow = {
  wallet?: string | null
  first_funded?: string | null
  age_days?: number | null
  funder?: string | null
  funder_cex?: string | null
  fresh?: boolean | null
}

export type SquadWalletAge = {
  source?: string | null
  traced?: number | null
  fresh_lt_14d?: SquadWalletAgeRow[] | null
  wallets?: SquadWalletAgeRow[] | null
}

export type SquadCapitalFlows = {
  source?: string | null
  wallets_sampled?: number | null
  wallets_total?: number | null
  sol_in?: number | null
  sol_out?: number | null
  sol_to_cex?: number | null
  usd_to_cex?: number | null
  by_exchange?: Record<string, number> | null
  top_cex_senders?: Array<{ wallet?: string; usd?: number; exchange?: string }> | null
}

export type PaperStrategy = {
  closed?: number | null
  open?: number | null
  realized_usd?: number | null
  open_mtm_usd?: number | null
  win_rate?: number | null
  staked_usd?: number | null
  equity_curve?: Array<[string, number]> | null
  pnl_usd?: number | null
  roi?: number | null
}

export type SquadPaperCopy = {
  source?: string | null
  mode?: string | null
  strategies?: Record<string, PaperStrategy> | null
}

export type SquadRow = {
  id: string
  name: string
  rank?: number | null
  rank_source?: string | null
  member_count?: number | null
  members_known?: number | null
  struck?: boolean | null
  pnl_total_usd?: number | null
  realized_usd?: number | null
  unrealized_usd?: number | null
  buy_spend_sol?: number | null
  pnl_source?: string | null
  realized_vs_unrealized?: {
    realized_usd?: number | null
    unrealized_usd?: number | null
    unrealized_share?: number | null
    source?: string | null
  } | null
  open_positions?: SquadOpenPosition[] | null
  closed_positions?: SquadClosedPosition[] | null
  positions_source?: string | null
  open_positions_source?: string | null
  members?: SquadMember[] | null
  anomaly?: SquadAnomaly | null
  liquidity?: {
    source?: string | null
    open_mark_value_usd?: number | null
    liquidatable_value_usd?: number | null
    mark_upnl_usd?: number | null
    liquidatable_upnl_usd?: number | null
    liquidatable_score?: number | null
    positions_unpriced?: number | null
    note?: string | null
  } | null
  exit_risk?: {
    max_supply_share_pct?: number | null
    positions_over_5pct_supply?: number | null
    source?: string | null
  } | null
  momentum?: SquadMomentum | null
  carry_concentration?: {
    source?: string | null
    members_with_pnl?: number | null
    sum_member_pnl_usd?: number | null
    top1_wallet?: string | null
    top1_username?: string | null
    top1_share_of_positive_pnl?: number | null
    gini_positive_pnl?: number | null
    profitable_members?: number | null
  } | null
  trade_stats?: SquadTradeStats | null
  early_entry_edge?: {
    source?: string | null
    tokens_entered?: number | null
    runs_5x_after_entry?: number | null
    hit_rate_5x?: number | null
    median_peak_multiple?: number | null
    median_minutes_before_peak_on_5x?: number | null
  } | null
  wallet_age?: SquadWalletAge | null
  capital_flows?: SquadCapitalFlows | null
  paper_copy?: SquadPaperCopy | null
}

export type CopySignal = {
  squad_id?: string | null
  squad?: string | null
  wallet?: string | null
  token?: string | null
  side?: string | null
  time?: string | null
  size_usd?: number | null
  strategy?: string | null
  paper_action?: string | null
}

export type SquadsPaperCopy = {
  paper_only?: boolean | null
  mode?: string | null
  configured_mode?: string | null
  kill_switch_engaged?: boolean | null
  mainnet_available?: boolean | null
  mainnet_note?: string | null
  risk_limits?: {
    max_per_trade_usd?: number | null
    daily_cap_usd?: number | null
    max_open_positions?: number | null
    max_slippage_pct?: number | null
  } | null
  note?: string | null
  summary?: {
    updated?: string | null
    paper_only?: boolean | null
    strats?: Record<string, PaperStrategy> | null
  } | null
}

export type SquadsOverlap = {
  source?: string | null
  shared_open_tokens?: Array<{
    mint?: string | null
    symbol?: string | null
    squads?: string[] | null
  }> | null
  cotrade_pairs?: Array<{
    squads?: string[] | null
    same_minute_events?: number | null
    mints?: number | null
    usd?: number | null
    sample?: Array<{
      mint?: string | null
      side?: string | null
      wallets?: string[] | null
      ts?: number | null
    }> | null
  }> | null
}

export type SquadsDashboard = {
  schema_version?: number
  updated_at?: string | null
  refresh_seconds?: number | null
  status?: SquadsStatus | null
  competition?: {
    id?: string
    name?: string
    slug?: string
    url?: string
    phase?: string
    registration_closes?: string
    start?: string
    end?: string
    prize_pool_usd?: number
    prizes?: Array<{ rankFrom?: number; rankTo?: number; amount?: string | number }>
    min_members?: number
    max_members?: number
    entries_count?: number
    squads_known?: number
    ranking?: string
  } | null
  sol_usd?: number | null
  squads?: SquadRow[] | null
  anomaly_watch?: {
    updated_utc?: string | null
    checks?: string[] | null
    weights?: Record<string, number> | null
    wallets_watched?: number | null
    mints_checked?: number | null
    flags_total?: number | null
    caveat?: string | null
  } | null
  fastest_climbers?: unknown[] | null
  overlap?: SquadsOverlap | null
  paper_copy?: SquadsPaperCopy | null
  copy_signals?: CopySignal[] | null
  disclaimer?: string | null
  methodology_url?: string | null
  dispute_contact?: string | null
  notes?: string[] | null
  caveat?: string | null
}

export type SquadsCopyFeed = {
  updated_at?: string | null
  status?: string | null
  mode?: string | null
  mainnet_available?: boolean | null
  paper_only?: boolean | null
  kill_switch_engaged?: boolean | null
  note?: string | null
  disclaimer?: string | null
  squads?: Array<{ id?: string; name?: string; paper_copy?: SquadPaperCopy | null }> | null
  signals?: CopySignal[] | null
  copy_signals?: CopySignal[] | null
  paper_copy?: SquadPaperCopy | null
  error?: string | null
}

export function squadsDisclaimer(feed?: Pick<SquadsDashboard, 'disclaimer'> | null): string {
  const text = feed?.disclaimer?.trim()
  return text || SQUADS_DISCLAIMER_FALLBACK
}

export function squadsMethodologyUrl(feed?: Pick<SquadsDashboard, 'methodology_url'> | null): string {
  const url = feed?.methodology_url?.trim()
  return url || SQUADS_METHODOLOGY_URL
}

export function squadsDisputeContact(feed?: Pick<SquadsDashboard, 'dispute_contact'> | null): string {
  const email = feed?.dispute_contact?.trim()
  return email || SQUADS_DISPUTE_CONTACT
}

export function isSquadsPreStart(status: SquadsStatus | null | undefined): boolean {
  return (status || '').toLowerCase() === 'pre-start'
}

export function isSquadsFeedStale(updatedAt: string | null | undefined, now = Date.now()): boolean {
  if (!updatedAt) return true
  const ts = Date.parse(updatedAt)
  if (!Number.isFinite(ts)) return true
  return now - ts > SQUADS_STALE_MS
}

export function squadsRefreshMs(refreshSeconds?: number | null): number {
  const sec = Number(refreshSeconds)
  if (Number.isFinite(sec) && sec >= 30) return sec * 1000
  return SQUADS_DEFAULT_REFRESH_MS
}

export function isMomentumWindowEmpty(window: SquadMomentumWindow | null | undefined): boolean {
  if (!window) return true
  return window.pnl_change_usd == null && window.rank_change == null && window.baseline == null
}

export function isMomentumCollecting(momentum: SquadMomentum | null | undefined): boolean {
  if (!momentum) return true
  return (
    isMomentumWindowEmpty(momentum['1h']) &&
    isMomentumWindowEmpty(momentum['6h']) &&
    isMomentumWindowEmpty(momentum['24h'])
  )
}

export function isWalletAgeCollecting(age: SquadWalletAge | null | undefined): boolean {
  if (!age) return true
  const traced = age.traced ?? 0
  const wallets = age.wallets?.length ?? 0
  const fresh = age.fresh_lt_14d?.length ?? 0
  return traced === 0 && wallets === 0 && fresh === 0
}

export function isCapitalFlowsCollecting(flows: SquadCapitalFlows | null | undefined): boolean {
  if (!flows) return true
  return (flows.wallets_sampled ?? 0) === 0
}

export function collectingOr<T>(empty: boolean, value: T): T | typeof SQUADS_COLLECTING {
  return empty ? SQUADS_COLLECTING : value
}

/** Public identity only: pump.fun username, X handle, or wallet. Never a real name. */
export function publicMemberLabel(member: SquadMember | null | undefined): string {
  const user = (member?.username || '').replace(/^@/, '').trim()
  if (user) return user
  const handle = (member?.x_handle || '').replace(/^@/, '').trim()
  if (handle) return handle
  return shortAddr(member?.wallet)
}

export function xHandleHref(handle: string | null | undefined): string | null {
  const h = (handle || '').replace(/^@/, '').trim()
  if (!h || !/^[A-Za-z0-9_]{1,15}$/.test(h)) return null
  return `https://x.com/${h}`
}

export function formatUsd(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const opts: Intl.NumberFormatOptions =
    abs >= 1000
      ? { maximumFractionDigits: 0, minimumFractionDigits: 0 }
      : { maximumFractionDigits: digits || (abs >= 1 ? 2 : 2), minimumFractionDigits: abs >= 1 ? 0 : 2 }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', ...opts }).format(n)
}

export function formatUsdSigned(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const body = formatUsd(Math.abs(n))
  if (n > 0) return `+${body}`
  if (n < 0) return `−${body}`
  return body
}

export function formatPct(n: number | null | undefined, alreadyPercent = false): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const pct = alreadyPercent ? n : n * 100
  return `${pct.toFixed(pct >= 10 || pct <= -10 ? 0 : 1)}%`
}

export function formatHoldMin(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n >= 60) return `${(n / 60).toFixed(1)}h`
  return `${n.toFixed(n >= 10 ? 0 : 1)}m`
}

export function formatWhen(iso: string | number | null | undefined): string {
  return formatUtc(iso)
}

export function squadNameById(squads: SquadRow[] | null | undefined): Map<string, string> {
  const map = new Map<string, string>()
  for (const s of squads || []) {
    if (s.id) map.set(s.id, s.name)
    if (s.name) map.set(s.name, s.name)
  }
  return map
}

export function resolveSquadLabel(idOrName: string, names: Map<string, string>): string {
  return names.get(idOrName) || idOrName
}

export function paperCopyBlocked(opts: {
  mode?: string | null
  mainnet_available?: boolean | null
  kill_switch_engaged?: boolean | null
  localKill?: boolean
}): boolean {
  if (opts.localKill) return true
  if (opts.kill_switch_engaged) return true
  if ((opts.mode || 'paper') === 'paper') return true
  if (opts.mainnet_available === false || opts.mainnet_available == null) return true
  // This UI never builds, signs, or sends a swap — live copy stays off.
  return true
}

export function paperCopyScoreAfterFees(strategy: PaperStrategy | null | undefined): number | null {
  if (!strategy) return null
  if (strategy.realized_usd == null && strategy.open_mtm_usd == null && strategy.pnl_usd == null) {
    return null
  }
  if (strategy.pnl_usd != null && Number.isFinite(strategy.pnl_usd)) {
    const mtm = strategy.open_mtm_usd
    if (mtm != null && Number.isFinite(mtm)) return strategy.pnl_usd + mtm
    return strategy.pnl_usd
  }
  return (strategy.realized_usd || 0) + (strategy.open_mtm_usd || 0)
}

export function readLocalKillSwitch(storage?: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return (storage ?? (typeof localStorage === 'undefined' ? null : localStorage))?.getItem(SQUADS_LOCAL_KILL_KEY) === '1'
  } catch {
    return false
  }
}

export function writeLocalKillSwitch(
  on: boolean,
  storage?: Pick<Storage, 'setItem' | 'removeItem'> | null,
): void {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
    if (!store) return
    if (on) store.setItem(SQUADS_LOCAL_KILL_KEY, '1')
    else store.removeItem(SQUADS_LOCAL_KILL_KEY)
  } catch {
    /* private mode */
  }
}

export function sharedFunders(
  squads: SquadRow[] | null | undefined,
): Array<{ funder: string; wallets: Array<{ wallet: string; squad: string }> }> {
  const byFunder = new Map<string, Array<{ wallet: string; squad: string }>>()
  for (const squad of squads || []) {
    for (const row of squad.wallet_age?.wallets || []) {
      const funder = (row.funder || '').trim()
      const wallet = (row.wallet || '').trim()
      if (!funder || !wallet) continue
      const list = byFunder.get(funder) || []
      list.push({ wallet, squad: squad.name })
      byFunder.set(funder, list)
    }
  }
  return [...byFunder.entries()]
    .map(([funder, wallets]) => ({ funder, wallets }))
    .filter((row) => new Set(row.wallets.map((w) => w.wallet)).size > 1)
    .sort((a, b) => b.wallets.length - a.wallets.length)
}

export function freshWallets(
  squads: SquadRow[] | null | undefined,
): Array<SquadWalletAgeRow & { squad: string }> {
  const out: Array<SquadWalletAgeRow & { squad: string }> = []
  for (const squad of squads || []) {
    for (const row of squad.wallet_age?.fresh_lt_14d || []) {
      out.push({ ...row, squad: squad.name })
    }
  }
  return out
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(res.ok ? 'Squads feed returned invalid JSON.' : 'Squads feed is unavailable.')
  }
}

export async function fetchSquadsDashboard(signal?: AbortSignal): Promise<SquadsDashboard> {
  const res = await fetch(SQUADS_DASHBOARD_URL, { signal })
  const data = await readJson(res)
  if (res.status === 503) {
    throw new Error(typeof data.error === 'string' ? data.error : 'feed not available yet')
  }
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Squads feed unavailable (${res.status})`)
  }
  return data as SquadsDashboard
}

export async function fetchSquadsCopy(squad?: string, signal?: AbortSignal): Promise<SquadsCopyFeed> {
  const url = squad
    ? `${SQUADS_COPY_URL}?squad=${encodeURIComponent(squad)}`
    : SQUADS_COPY_URL
  const res = await fetch(url, { signal })
  const data = await readJson(res)
  if (res.status === 404 || data.error) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Unknown squad')
  }
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Copy feed unavailable (${res.status})`)
  }
  return data as SquadsCopyFeed
}

export function copySignalsOf(feed: SquadsCopyFeed | null | undefined): CopySignal[] {
  return feed?.copy_signals || feed?.signals || []
}
