import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { CREW_AGENT_API_URL } from '../lib/config'
import { dryRunIdFromApprovePath } from '../lib/routes'

type DryRunView = {
  ok?: boolean
  dryRunId: string
  approved: boolean
  approvedAt: string | null
  consumed: boolean
  expiresAt: string
  plan: {
    name?: string
    ticker?: string
    mode?: string
    initialBuySol?: number
    costs?: { needSol?: number; note?: string }
    feeMap?: { platformBuybackBps?: number; deskBps?: number; crewPoolBps?: number }
    warnings?: string[]
    vibe?: string
  }
}

export function ApprovePage() {
  const { pathname } = useLocation()
  const dryRunId = dryRunIdFromApprovePath(pathname) || ''
  const [params] = useSearchParams()
  const token = params.get('t') || params.get('token') || ''
  const [data, setData] = useState<DryRunView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const apiBase = CREW_AGENT_API_URL

  useEffect(() => {
    if (!dryRunId) {
      setError('Missing dry-run id in URL')
      return
    }
    let cancelled = false
    ;(async () => {
      setError(null)
      try {
        const res = await fetch(`${apiBase}/api/agent/launch/dry-run/${encodeURIComponent(dryRunId)}`)
        const json = (await res.json()) as DryRunView & { error?: string }
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        if (!cancelled) setData(json)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dry-run')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiBase, dryRunId])

  const feeLine = useMemo(() => {
    const fm = data?.plan?.feeMap
    if (!fm) return null
    const platform = (fm.platformBuybackBps ?? 2500) / 100
    const desk = (fm.deskBps ?? 1500) / 100
    const crew = (fm.crewPoolBps ?? 6000) / 100
    return `${crew}% KOL crew · ${desk}% launching agent · ${platform}% CrewPay treasury (buyback cron not live)`
  }, [data])

  async function onApprove() {
    if (!token) {
      setError('Missing approval token in URL (?t=…)')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `${apiBase}/api/agent/launch/dry-run/${encodeURIComponent(dryRunId)}/approve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        },
      )
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setDone(true)
      setData((prev) => (prev ? { ...prev, approved: true, approvedAt: new Date().toISOString() } : prev))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell agents-page">
      <section className="section">
        <p className="section-label">Human approval</p>
        <h1 className="section-title">Approve dry-run</h1>
        <p className="section-sub">
          Review this planned MAINNET launch. Approving does not spend SOL — it only unlocks the
          agent&apos;s next <code>POST /api/agent/launch</code> with this <code>dryRunId</code>.
        </p>

        {error ? <p className="desk-banner desk-banner-error">{error}</p> : null}
        {done ? (
          <p className="desk-banner desk-banner-info">
            Approved. Tell the agent to launch with <code>dryRunId={dryRunId}</code> and the same
            body.
          </p>
        ) : null}

        {!data && !error ? <p className="section-sub">Loading…</p> : null}

        {data ? (
          <div className="agents-card" style={{ marginTop: '1.25rem' }}>
            <p>
              <strong>
                {data.plan?.name || '—'} · ${data.plan?.ticker || '—'}
              </strong>
            </p>
            <p className="section-sub">
              Mode: {data.plan?.mode || 'agent'} · Initial buy:{' '}
              {data.plan?.initialBuySol ?? 0} SOL
              {data.plan?.costs?.needSol != null
                ? ` · Needs ≥ ${data.plan.costs.needSol} SOL`
                : ''}
            </p>
            {feeLine ? <p className="section-sub">{feeLine}</p> : null}
            {data.plan?.vibe ? (
              <p className="section-sub">
                Description: <em>{data.plan.vibe}</em>
              </p>
            ) : null}
            {data.plan?.warnings?.length ? (
              <ul className="section-sub">
                {data.plan.warnings.slice(0, 6).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
            <p className="section-sub">
              Status:{' '}
              {data.consumed
                ? 'already used'
                : data.approved
                  ? 'approved'
                  : 'awaiting your confirmation'}{' '}
              · expires {new Date(data.expiresAt).toLocaleString()}
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || data.approved || data.consumed || !token}
                onClick={() => void onApprove()}
              >
                {busy ? 'Approving…' : data.approved ? 'Already approved' : 'Approve launch plan'}
              </button>
              <Link className="btn btn-ghost" to="/agents">
                Agents docs
              </Link>
            </div>
            {!token ? (
              <p className="section-sub" style={{ marginTop: '0.75rem' }}>
                This link is missing the approval token. Use the full <code>approvalUrl</code> from
                dry-run.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default ApprovePage
