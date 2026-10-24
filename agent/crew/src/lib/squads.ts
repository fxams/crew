import { CREW_AGENT_API_URL } from './config'
import { formatUtc } from './format-utc'
import { shortAddr } from './wallet'

export const SQUADS_DASHBOARD_PATH = '/api/squads/dashboard'
export const SQUADS_COPY_PATH = '/api/squads/copy'
export const SQUADS_CHARTS_PATH = '/api/squads/charts'
export const SQUADS_TOKEN_CHART_PATH = '/api/squads/token-chart'
export const SQUADS_METHODOLOGY_PATH = '/squads/methodology'
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
  notes?: string[] | null
  caveat?: string | null
}

export type SquadChartToken = {
  mint: string
  symbol?: string | null
  events?: {
    launch?: number | null
    buy?: number | null
    sell?: number | null
    call?: number | null
  } | null
  buy_sol?: number | null
  sell_sol?: number | null
  net_sol?: number | null
  first_event?: string | number | null
  last_event?: string | number | null
  graduated?: boolean | null
}

export type SquadChartsRow = {
  id: string
  name: string
  rank?: number | null
  anomaly_score?: number | null
  tokens?: SquadChartToken[] | null
}

export type SquadsChartsFeed = {
  meta?: Record<string, unknown> | null
  squads?: SquadChartsRow[] | null
  disclaimer?: string | null
}

export type SquadCandle = [number, number, number, number, number, number]

export type SquadChartMarkerType = 'launch' | 'buy' | 'sell' | 'call' | string

export type SquadChartMarker = {
  t?: number | string | null
  ts?: number | string | null
  type?: SquadChartMarkerType | null
  wallet?: string | null
  username?: string | null
  x_handle?: string | null
  sol?: number | null
  price?: number | null
  trades?: number | null
  venue?: string | null
  note?: string | null
}

export type SquadTokenChart = {
  squad?: string | null
  mint?: string | null
  symbol?: string | null
  creator?: string | null
  created_at?: string | number | null
  graduated_at?: string | number | null
  interval_sec?: number | null
  price_unit?: string | null
  supply?: number | null
  candle_fields?: string[] | null
  candles?: SquadCandle[] | null
  markers?: SquadChartMarker[] | null
  summary?: Record<string, unknown> | null
}

export type SquadsTokenChartFeed = {
  meta?: Record<string, unknown> | null
  chart?: SquadTokenChart | null
  disclaimer?: string | null
  error?: string | null
}

export type SquadCandlePoint = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type SquadMarkerPoint = {
  time: number
  type: SquadChartMarkerType
  wallet?: string | null
  username?: string | null
  x_handle?: string | null
  sol?: number | null
  price?: number | null
  trades?: number | null
  venue?: string | null
  note?: string | null
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

export function squadsMethodologyUrl(): string {
  return SQUADS_METHODOLOGY_PATH
}

export function squadsDisputeContact(): string {
  return SQUADS_DISPUTE_CONTACT
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

export function squadsDashboardUrl(): string {
  return `${CREW_AGENT_API_URL}${SQUADS_DASHBOARD_PATH}`
}

export function squadsCopyUrl(squad: string): string {
  return `${CREW_AGENT_API_URL}${SQUADS_COPY_PATH}?squad=${encodeURIComponent(squad)}`
}

export function squadsChartsUrl(): string {
  return `${CREW_AGENT_API_URL}${SQUADS_CHARTS_PATH}`
}

export function squadsTokenChartUrl(squad: string, mint: string): string {
  return `${CREW_AGENT_API_URL}${SQUADS_TOKEN_CHART_PATH}?squad=${encodeURIComponent(squad)}&mint=${encodeURIComponent(mint)}`
}

/** Unix seconds from ISO / unix s / unix ms. */
export function toUnixSeconds(input: string | number | null | undefined): number | null {
  if (input == null || input === '') return null
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null
    if (input >= 1e12) return Math.floor(input / 1000)
    if (input >= 1e9) return Math.floor(input)
    return null
  }
  const raw = String(input).trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) return toUnixSeconds(Number(raw))
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
}

/** Floor a marker timestamp onto the latest candle time at or before it. */
export function snapUnixToCandle(unixS: number, candleTimes: number[]): number | null {
  if (!candleTimes.length || !Number.isFinite(unixS)) return null
  let snapped: number | null = null
  for (const t of candleTimes) {
    if (t <= unixS) snapped = t
    else break
  }
  return snapped ?? candleTimes[0]
}

export function scaleSquadCandles(
  candles: SquadCandle[] | null | undefined,
  supply: number | null | undefined,
  mode: 'price' | 'mcap',
): SquadCandlePoint[] {
  const factor = mode === 'mcap' && supply != null && Number.isFinite(supply) && supply > 0 ? supply : 1
  const out: SquadCandlePoint[] = []
  for (const row of candles || []) {
    if (!Array.isArray(row) || row.length < 5) continue
    const time = toUnixSeconds(row[0])
    const open = Number(row[1]) * factor
    const high = Number(row[2]) * factor
    const low = Number(row[3]) * factor
    const close = Number(row[4]) * factor
    const volume = Number(row[5] ?? 0)
    if (time == null || ![open, high, low, close].every((n) => Number.isFinite(n) && n > 0)) continue
    out.push({ time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 })
  }
  out.sort((a, b) => a.time - b.time)
  return out
}

export function snapSquadMarkers(
  markers: SquadChartMarker[] | null | undefined,
  candleTimes: number[],
): SquadMarkerPoint[] {
  const out: SquadMarkerPoint[] = []
  for (const marker of markers || []) {
    const raw = toUnixSeconds(marker.t ?? marker.ts ?? null)
    if (raw == null) continue
    const time = snapUnixToCandle(raw, candleTimes)
    if (time == null) continue
    out.push({
      time,
      type: marker.type || 'call',
      wallet: marker.wallet,
      username: marker.username,
      x_handle: marker.x_handle,
      sol: marker.sol,
      price: marker.price,
      trades: marker.trades,
      venue: marker.venue,
      note: marker.note,
    })
  }
  return out
}

export function publicMarkerLabel(marker: Pick<SquadMarkerPoint, 'username' | 'x_handle' | 'wallet'>): string {
  return publicMemberLabel({
    username: marker.username,
    x_handle: marker.x_handle,
    wallet: marker.wallet,
  })
}

export async function fetchSquadsDashboard(signal?: AbortSignal): Promise<SquadsDashboard> {
  const res = await fetch(squadsDashboardUrl(), { signal })
  const data = await readJson(res)
  if (res.status === 503) {
    throw new Error(typeof data.error === 'string' ? data.error : 'feed not available yet')
  }
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Squads feed unavailable (${res.status})`)
  }
  return data as SquadsDashboard
}

export async function fetchSquadsCharts(signal?: AbortSignal): Promise<SquadsChartsFeed> {
  const res = await fetch(squadsChartsUrl(), { signal })
  const data = await readJson(res)
  if (res.status === 503) {
    throw new Error(typeof data.error === 'string' ? data.error : 'feed not available yet')
  }
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Squads charts unavailable (${res.status})`)
  }
  return data as SquadsChartsFeed
}

export async function fetchSquadsTokenChart(
  squad: string,
  mint: string,
  signal?: AbortSignal,
): Promise<SquadsTokenChartFeed> {
  const res = await fetch(squadsTokenChartUrl(squad, mint), { signal })
  const data = await readJson(res)
  if (res.status === 404) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Chart not found')
  }
  if (res.status === 503) {
    throw new Error(typeof data.error === 'string' ? data.error : 'feed not available yet')
  }
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Token chart unavailable (${res.status})`)
  }
  return data as SquadsTokenChartFeed
}

export async function fetchSquadsCopy(squad: string, signal?: AbortSignal): Promise<SquadsCopyFeed> {
  const res = await fetch(squadsCopyUrl(squad), { signal })
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
