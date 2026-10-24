import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  PriceScaleMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarkerBar,
  type SeriesMarkerBarPosition,
  type SeriesMarkerShape,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { formatUtc } from '../lib/format-utc'
import {
  fetchSquadsCharts,
  fetchSquadsTokenChart,
  markerWalletCount,
  publicBundleMembers,
  publicMarkerLabel,
  scaleSquadCandles,
  snapSquadMarkers,
  squadsShareIntentUrl,
  tokenBundleCount,
  type SquadChartsRow,
  type SquadChartToken,
  type SquadMarkerPoint,
  type SquadShareSection,
  type SquadsTokenChartFeed,
} from '../lib/squads'
import { applyTheme, readTheme, writeTheme, type CrewTheme } from '../lib/theme'

type ScaleMode = 'price' | 'mcap'

const MARKER_STYLE: Record<
  string,
  { color: string; shape: SeriesMarkerShape; position: SeriesMarkerBarPosition; text: string }
> = {
  launch: { color: '#9b6dff', shape: 'square', position: 'aboveBar', text: 'L' },
  buy: { color: '#3dd68c', shape: 'arrowUp', position: 'belowBar', text: '' },
  sell: { color: '#ff6b6b', shape: 'arrowDown', position: 'aboveBar', text: '' },
  call: { color: '#4da3ff', shape: 'circle', position: 'aboveBar', text: 'C' },
  bundle: { color: '#f59e0b', shape: 'square', position: 'aboveBar', text: 'B' },
}

const CHART_THEME: Record<CrewTheme, { bg: string; text: string; grid: string }> = {
  dark: { bg: '#0b0f17', text: '#d1d5db', grid: '#1a2230' },
  light: { bg: '#f7f8fa', text: '#1f2933', grid: '#e4e7ec' },
}

function formatSol(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const digits = Math.abs(n) >= 10 ? 1 : 2
  return `${n.toFixed(digits)} SOL`
}

function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n >= 1) return n.toFixed(4)
  return n.toPrecision(3)
}

function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(Math.abs(n) >= 10 ? 1 : 2)}%`
}

function markerLine(marker: SquadMarkerPoint): string {
  if (marker.type === 'bundle') {
    const members = publicBundleMembers(marker.squad_members)
    const bits = [
      'bundle',
      marker.kind,
      marker.side,
      `${markerWalletCount(marker)} wallets`,
      formatSol(marker.sol),
      marker.supply_pct != null ? formatPct(marker.supply_pct) : null,
      members.length ? members.join(', ') : null,
    ].filter(Boolean)
    return bits.join(' · ')
  }
  const who = publicMarkerLabel(marker)
  const bits = [
    marker.type,
    who.startsWith('@') ? who : `@${who}`,
    formatSol(marker.sol),
    marker.price != null ? formatPrice(marker.price) : null,
    marker.venue,
  ].filter(Boolean)
  return bits.join(' · ')
}

function toSeriesMarkers(points: SquadMarkerPoint[]): SeriesMarkerBar<Time>[] {
  return points.map((m) => {
    const style = MARKER_STYLE[m.type] || MARKER_STYLE.call
    return {
      time: m.time as UTCTimestamp,
      color: style.color,
      shape: style.shape,
      position: style.position,
      text: style.text,
    }
  })
}

function readActivityQuery(): { squad: string; mint: string } {
  if (typeof window === 'undefined') return { squad: '', mint: '' }
  const q = new URLSearchParams(window.location.search)
  return { squad: (q.get('squad') || '').trim(), mint: (q.get('mint') || '').trim() }
}

function ShareOnX(props: {
  squad: string
  mint: string
  section: SquadShareSection
  squadName?: string | null
  symbol?: string | null
}) {
  if (!props.squad || !props.mint) return null
  const href = squadsShareIntentUrl(props)
  return (
    <a
      className="btn btn-ghost btn-sm squads-share-x"
      href={href}
      target="_blank"
      rel="noreferrer"
      data-testid={`squads-share-${props.section}`}
    >
      Share on X
    </a>
  )
}

export function SquadActivityChart({ disclaimer }: { disclaimer: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const initialQuery = useRef(readActivityQuery())

  const [theme, setTheme] = useState<CrewTheme>(() => readTheme())
  const [squads, setSquads] = useState<SquadChartsRow[]>([])
  const [squadId, setSquadId] = useState(initialQuery.current.squad)
  const [mint, setMint] = useState(initialQuery.current.mint)
  const [scale, setScale] = useState<ScaleMode>('price')
  const [logScale, setLogScale] = useState(true)
  const [feed, setFeed] = useState<SquadsTokenChartFeed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingIndex, setLoadingIndex] = useState(true)
  const [loadingChart, setLoadingChart] = useState(false)
  const [hover, setHover] = useState<SquadMarkerPoint[] | null>(null)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    const ctrl = new AbortController()
    void fetchSquadsCharts(ctrl.signal)
      .then((next) => {
        if (ctrl.signal.aborted) return
        const rows = next.squads || []
        setSquads(rows)
        const wanted = rows.find((s) => s.id === initialQuery.current.squad) || rows.find((s) => (s.tokens || []).length) || rows[0]
        if (wanted) {
          setSquadId((cur) => cur || wanted.id)
          const wantedMint =
            wanted.tokens?.find((t) => t.mint === initialQuery.current.mint)?.mint || wanted.tokens?.[0]?.mint
          if (wantedMint) setMint((cur) => cur || wantedMint)
        }
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Charts unavailable')
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingIndex(false)
      })
    return () => ctrl.abort()
  }, [])

  useEffect(() => {
    if (!squadId || !mint) return
    const ctrl = new AbortController()
    setLoadingChart(true)
    setError(null)
    void fetchSquadsTokenChart(squadId, mint, ctrl.signal)
      .then((next) => {
        if (!ctrl.signal.aborted) setFeed(next)
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) {
          setFeed(null)
          setError(e instanceof Error ? e.message : 'Token chart unavailable')
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingChart(false)
      })
    return () => ctrl.abort()
  }, [squadId, mint])

  useEffect(() => {
    if (!squadId || !mint) return
    const path = window.location.pathname.replace(/\/+$/, '')
    if (!path.endsWith('/squads/activity')) return
    const next = new URLSearchParams({ squad: squadId, mint })
    const hash = window.location.hash
    window.history.replaceState(null, '', `${path}?${next.toString()}${hash}`)
  }, [squadId, mint])

  useEffect(() => {
    const id = window.location.hash.replace(/^#/, '')
    if (!id || loadingChart || loadingIndex) return
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ block: 'start' })
  }, [loadingChart, loadingIndex, feed])

  const tokens = useMemo(() => {
    const row = squads.find((s) => s.id === squadId)
    return row?.tokens || []
  }, [squads, squadId])
  const selectedToken: SquadChartToken | undefined = tokens.find((t) => t.mint === mint)
  const squadName = squads.find((s) => s.id === squadId)?.name || squadId

  const candles = useMemo(
    () => scaleSquadCandles(feed?.chart?.candles, feed?.chart?.supply, scale),
    [feed, scale],
  )
  const candleTimes = useMemo(() => candles.map((c) => c.time), [candles])
  const markers = useMemo(
    () => snapSquadMarkers(feed?.chart?.markers, candleTimes),
    [feed, candleTimes],
  )
  const markersByTime = useMemo(() => {
    const map = new Map<number, SquadMarkerPoint[]>()
    for (const m of markers) {
      const list = map.get(m.time) || []
      list.push(m)
      map.set(m.time, list)
    }
    return map
  }, [markers])
  const markersByTimeRef = useRef(markersByTime)
  markersByTimeRef.current = markersByTime

  const palette = CHART_THEME[theme]
  const paletteRef = useRef(palette)
  paletteRef.current = palette

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const colors = paletteRef.current
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colors.bg },
        textColor: colors.text,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: {
        borderColor: colors.grid,
        mode: PriceScaleMode.Logarithmic,
      },
      timeScale: {
        borderColor: colors.grid,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => formatUtc(typeof time === 'number' ? time : String(time)),
      },
      localization: {
        timeFormatter: (time: Time) => formatUtc(typeof time === 'number' ? time : String(time)),
      },
      crosshair: { mode: 1 },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#c8ff3d',
      downColor: '#ff6b6b',
      borderVisible: false,
      wickUpColor: '#c8ff3d',
      wickDownColor: '#ff6b6b',
    })
    const markerApi = createSeriesMarkers(series, [])
    chart.subscribeCrosshairMove((param) => {
      const t = typeof param.time === 'number' ? param.time : null
      setHover(t == null ? null : markersByTimeRef.current.get(t) || null)
    })
    chartRef.current = chart
    seriesRef.current = series
    markersApiRef.current = markerApi
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      markersApiRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: palette.bg },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: { borderColor: palette.grid },
      timeScale: { borderColor: palette.grid },
    })
  }, [palette])

  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({
      mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    })
  }, [logScale])

  useEffect(() => {
    const series = seriesRef.current
    const chart = chartRef.current
    const markerApi = markersApiRef.current
    if (!series || !chart) return
    series.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })))
    markerApi?.setMarkers(toSeriesMarkers(markers))
    chart.timeScale().fitContent()
  }, [candles, markers])

  function onSquadChange(next: string) {
    setSquadId(next)
    const row = squads.find((s) => s.id === next)
    setMint(row?.tokens?.[0]?.mint || '')
    setFeed(null)
    setHover(null)
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    writeTheme(next)
    applyTheme(next)
    setTheme(next)
  }

  const symbol = feed?.chart?.symbol || selectedToken?.symbol || '—'
  const hoverLines = hover?.length ? hover : []
  const bundleMarks = markers.filter((m) => m.type === 'bundle')
  const summary = feed?.chart?.summary || {}

  return (
    <div className="squads-activity-wrap">
      <section className="squads-block squads-activity" id="chart" aria-labelledby="squads-activity">
        <div className="squads-section-head">
          <h2 id="squads-activity" className="squads-h2">
            Squad activity
          </h2>
          <div className="squads-section-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={toggleTheme}
              data-testid="squads-theme-toggle"
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <ShareOnX squad={squadId} mint={mint} section="chart" squadName={squadName} symbol={symbol} />
          </div>
        </div>
        <p className="squads-disclaimer" data-testid="squads-activity-disclaimer">
          {disclaimer}
        </p>
        <div className="squads-activity-controls">
          <label className="field-label" htmlFor="squads-activity-squad">
            Squad
            <select
              id="squads-activity-squad"
              className="input"
              value={squadId}
              onChange={(e) => onSquadChange(e.target.value)}
              data-testid="squads-activity-squad"
            >
              {!squads.length ? <option value="">No squads</option> : null}
              {squads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label" htmlFor="squads-activity-token">
            Token
            <select
              id="squads-activity-token"
              className="input"
              value={mint}
              onChange={(e) => {
                setMint(e.target.value)
                setHover(null)
              }}
              data-testid="squads-activity-token"
            >
              {!tokens.length ? <option value="">No tokens</option> : null}
              {tokens.map((t) => (
                <option key={t.mint} value={t.mint}>
                  {t.symbol || t.mint.slice(0, 6)}
                  {tokenBundleCount(t) ? ` · ${tokenBundleCount(t)} bundles` : ''}
                  {t.graduated ? ' · grad' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="squads-activity-toggles" role="group" aria-label="Price scale">
            <button
              type="button"
              className={scale === 'price' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => setScale('price')}
              data-testid="squads-activity-price"
            >
              Price
            </button>
            <button
              type="button"
              className={scale === 'mcap' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => setScale('mcap')}
              data-testid="squads-activity-mcap"
            >
              Market cap
            </button>
            <label className="squads-activity-log">
              <input
                type="checkbox"
                checked={logScale}
                onChange={(e) => setLogScale(e.target.checked)}
                data-testid="squads-activity-log"
              />
              Log
            </label>
          </div>
        </div>
        <p className="muted squads-activity-meta">
          {symbol}
          {feed?.chart?.created_at ? ` · first ${formatUtc(feed.chart.created_at)}` : ''}
          {scale === 'mcap' ? ' · market cap = price × supply' : ''}
        </p>
        <div className="squads-activity-legend" aria-hidden="true">
          <span>
            <i className="squads-mark squads-mark-launch" /> Launch
          </span>
          <span>
            <i className="squads-mark squads-mark-buy" /> Buy
          </span>
          <span>
            <i className="squads-mark squads-mark-sell" /> Sell
          </span>
          <span>
            <i className="squads-mark squads-mark-call" /> Call
          </span>
          <span>
            <i className="squads-mark squads-mark-bundle" /> Bundle
          </span>
        </div>
        {loadingIndex || loadingChart ? <p className="muted">Loading activity…</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <div
          ref={hostRef}
          className="squads-activity-chart"
          data-testid="squads-activity-chart"
          role="img"
          aria-label="Squad token activity candles"
        />
        <div className="squads-activity-tip" data-testid="squads-activity-tip">
          {hoverLines.length ? (
            <ul>
              {hoverLines.map((m, i) => (
                <li key={`${m.time}-${m.type}-${i}`}>
                  {formatUtc(m.time)} · {markerLine(m)}
                </li>
              ))}
            </ul>
          ) : candles.length ? (
            <p className="muted">Hover a marker for username, SOL, price, venue, or bundle details.</p>
          ) : !loadingChart && !error ? (
            <p className="muted">No candles for this token yet.</p>
          ) : null}
        </div>
      </section>

      <section className="squads-block squads-activity-summary" id="summary" aria-labelledby="squads-summary">
        <div className="squads-section-head">
          <h2 id="squads-summary" className="squads-h2">
            Summary
          </h2>
          <ShareOnX squad={squadId} mint={mint} section="summary" squadName={squadName} symbol={symbol} />
        </div>
        <dl className="squads-stat-grid" data-testid="squads-activity-summary">
          <div>
            <dt>Buys</dt>
            <dd>{formatSol(selectedToken?.buy_sol)}</dd>
          </div>
          <div>
            <dt>Sells</dt>
            <dd>{formatSol(selectedToken?.sell_sol)}</dd>
          </div>
          <div>
            <dt>Net</dt>
            <dd>{formatSol(selectedToken?.net_sol)}</dd>
          </div>
          <div>
            <dt>Bundles</dt>
            <dd>{tokenBundleCount(selectedToken) || '—'}</dd>
          </div>
          <div>
            <dt>Bundled buy</dt>
            <dd>{formatSol(selectedToken?.bundled_buy_sol)}</dd>
          </div>
          <div>
            <dt>Bundled sell</dt>
            <dd>{formatSol(selectedToken?.bundled_sell_sol)}</dd>
          </div>
          <div>
            <dt>First</dt>
            <dd>{formatUtc(selectedToken?.first_event ?? feed?.chart?.created_at)}</dd>
          </div>
          <div>
            <dt>Last</dt>
            <dd>{formatUtc(selectedToken?.last_event)}</dd>
          </div>
        </dl>
        {Object.keys(summary).length ? (
          <p className="muted squads-activity-meta">
            Chart summary
            {typeof summary.buy_sol === 'number' ? ` · buy ${formatSol(summary.buy_sol)}` : ''}
            {typeof summary.sell_sol === 'number' ? ` · sell ${formatSol(summary.sell_sol)}` : ''}
          </p>
        ) : null}
      </section>

      <section className="squads-block squads-activity-analysis" id="analysis" aria-labelledby="squads-analysis">
        <div className="squads-section-head">
          <h2 id="squads-analysis" className="squads-h2">
            Analysis
          </h2>
          <ShareOnX squad={squadId} mint={mint} section="analysis" squadName={squadName} symbol={symbol} />
        </div>
        <div className="squads-method-prose" data-testid="squads-activity-analysis">
          <p>
            {symbol} for {squadName || 'this squad'}: {markers.length} snapped markers
            {bundleMarks.length ? ` including ${bundleMarks.length} bundles` : ''}. Launches, buys, sells,
            and calls are individual member events. Bundles are slot-based clusters of wallets on the same
            token — see methodology for the two public rules.
          </p>
          {bundleMarks.length ? (
            <ul>
              {bundleMarks.slice(0, 8).map((m, i) => (
                <li key={`${m.time}-bundle-${i}`}>
                  {formatUtc(m.time)} · {markerLine(m)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No bundle markers on this token in the latest feed.</p>
          )}
        </div>
      </section>
    </div>
  )
}
