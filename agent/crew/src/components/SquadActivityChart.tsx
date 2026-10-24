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
  publicMarkerLabel,
  scaleSquadCandles,
  snapSquadMarkers,
  type SquadChartsRow,
  type SquadMarkerPoint,
  type SquadsTokenChartFeed,
} from '../lib/squads'

type ScaleMode = 'price' | 'mcap'

const MARKER_STYLE: Record<
  string,
  { color: string; shape: SeriesMarkerShape; position: SeriesMarkerBarPosition; text: string }
> = {
  launch: { color: '#9b6dff', shape: 'square', position: 'aboveBar', text: 'L' },
  buy: { color: '#3dd68c', shape: 'arrowUp', position: 'belowBar', text: '' },
  sell: { color: '#ff6b6b', shape: 'arrowDown', position: 'aboveBar', text: '' },
  call: { color: '#4da3ff', shape: 'circle', position: 'aboveBar', text: 'C' },
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

function markerLine(marker: SquadMarkerPoint): string {
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

export function SquadActivityChart({ disclaimer }: { disclaimer: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)

  const [squads, setSquads] = useState<SquadChartsRow[]>([])
  const [squadId, setSquadId] = useState('')
  const [mint, setMint] = useState('')
  const [scale, setScale] = useState<ScaleMode>('price')
  const [logScale, setLogScale] = useState(true)
  const [feed, setFeed] = useState<SquadsTokenChartFeed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingIndex, setLoadingIndex] = useState(true)
  const [loadingChart, setLoadingChart] = useState(false)
  const [hover, setHover] = useState<SquadMarkerPoint[] | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    void fetchSquadsCharts(ctrl.signal)
      .then((next) => {
        if (ctrl.signal.aborted) return
        const rows = next.squads || []
        setSquads(rows)
        const first = rows.find((s) => (s.tokens || []).length) || rows[0]
        if (first) {
          setSquadId(first.id)
          const tok = first.tokens?.[0]
          if (tok?.mint) setMint(tok.mint)
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

  const tokens = useMemo(() => {
    const row = squads.find((s) => s.id === squadId)
    return row?.tokens || []
  }, [squads, squadId])

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

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#050806' },
        textColor: '#9aa89a',
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: 'rgba(200,255,61,0.08)' },
        horzLines: { color: 'rgba(200,255,61,0.08)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(200,255,61,0.18)',
        mode: PriceScaleMode.Logarithmic,
      },
      timeScale: {
        borderColor: 'rgba(200,255,61,0.18)',
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

  const symbol = feed?.chart?.symbol || tokens.find((t) => t.mint === mint)?.symbol || '—'
  const hoverLines = hover?.length ? hover : []

  return (
    <section className="squads-block squads-activity" aria-labelledby="squads-activity">
      <h2 id="squads-activity" className="squads-h2">
        Squad activity
      </h2>
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
          <p className="muted">Hover a marker for username, SOL, price, and venue.</p>
        ) : !loadingChart && !error ? (
          <p className="muted">No candles for this token yet.</p>
        ) : null}
      </div>
    </section>
  )
}
