import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import bs58 from 'bs58'
import { CREW_AGENT_API_URL } from '../lib/config'
import { dryRunIdFromApprovePath } from '../lib/routes'

type DryRunView = {
  ok?: boolean
  dryRunId: string
  intent?: 'launch' | 'wire-fees'
  approved: boolean
  approvedAt: string | null
  approvedByWallet?: string | null
  consumed: boolean
  expiresAt: string
  imageSha256?: string | null
  plan: {
    name?: string
    ticker?: string
    mint?: string
    mode?: string
    initialBuySol?: number
    costs?: { needSol?: number; note?: string }
    feeMap?: { platformBuybackBps?: number; deskBps?: number; crewPoolBps?: number }
    warnings?: string[]
    vibe?: string
    note?: string
  }
}

export function ApprovePage() {
  const { pathname } = useLocation()
  const dryRunId = dryRunIdFromApprovePath(pathname) || ''
  const wallet = useWallet()
  const { setVisible } = useWalletModal()
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
    if (!wallet.publicKey || !wallet.signMessage) {
      setVisible(true)
      setError('Connect a wallet to approve (agent API keys cannot approve).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const timestamp = Date.now()
      const message = `crew-approve-dry-run:${dryRunId}:${timestamp}`
      const sig = await wallet.signMessage(new TextEncoder().encode(message))
      const res = await fetch(
        `${apiBase}/api/agent/launch/dry-run/${encodeURIComponent(dryRunId)}/approve`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-crew-wallet': wallet.publicKey.toBase58(),
            'x-crew-timestamp': String(timestamp),
            'x-crew-signature': bs58.encode(sig),
            'x-crew-dry-run-id': dryRunId,
          },
          body: JSON.stringify({ dryRunId }),
        },
      )
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setDone(true)
      setData((prev) =>
        prev
          ? {
              ...prev,
              approved: true,
              approvedAt: new Date().toISOString(),
              approvedByWallet: wallet.publicKey?.toBase58() ?? null,
            }
          : prev,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setBusy(false)
    }
  }

  const intent = data?.intent || 'launch'

  return (
    <div className="app-shell agents-page">
      <section className="section">
        <p className="section-label">Human approval</p>
        <h1 className="section-title">Approve dry-run</h1>
        <p className="section-sub">
          Review this planned MAINNET {intent === 'wire-fees' ? 'wire-fees' : 'launch'}. Approving
          does not spend SOL — it unlocks the agent&apos;s next spend call with this{' '}
          <code>dryRunId</code>. Connect a wallet to sign; agent API keys are rejected.
        </p>

        {error ? <p className="desk-banner desk-banner-error">{error}</p> : null}
        {done ? (
          <p className="desk-banner desk-banner-info">
            Approved. Tell the agent to call{' '}
            <code>
              {intent === 'wire-fees' ? 'POST /api/agent/wire-fees' : 'POST /api/agent/launch'}
            </code>{' '}
            with <code>dryRunId={dryRunId}</code> and the same body.
          </p>
        ) : null}

        {!data && !error ? <p className="section-sub">Loading…</p> : null}

        {data ? (
          <div className="agents-card" style={{ marginTop: '1.25rem' }}>
            <p>
              <strong>
                {intent === 'wire-fees'
                  ? `Wire fees · ${data.plan?.mint || '—'}`
                  : `${data.plan?.name || '—'} · $${data.plan?.ticker || '—'}`}
              </strong>
            </p>
            <p className="section-sub">
              Intent: {intent} · Mode: {data.plan?.mode || 'agent'}
              {intent === 'launch' && data.plan?.initialBuySol != null
                ? ` · Initial buy: ${data.plan.initialBuySol} SOL`
                : ''}
              {data.plan?.costs?.needSol != null ? ` · Needs ≥ ${data.plan.costs.needSol} SOL` : ''}
            </p>
            {data.imageSha256 ? (
              <p className="section-sub">
                Image sha256: <code>{data.imageSha256.slice(0, 16)}…</code>
              </p>
            ) : null}
            {feeLine ? <p className="section-sub">{feeLine}</p> : null}
            {data.plan?.vibe ? (
              <p className="section-sub">
                Description: <em>{data.plan.vibe}</em>
              </p>
            ) : null}
            {data.plan?.note ? <p className="section-sub">{data.plan.note}</p> : null}
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
                  : 'awaiting wallet confirmation'}{' '}
              · expires {new Date(data.expiresAt).toLocaleString()}
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              {!wallet.publicKey ? (
                <button type="button" className="btn btn-primary" onClick={() => setVisible(true)}>
                  Connect wallet to approve
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || data.approved || data.consumed}
                  onClick={() => void onApprove()}
                >
                  {busy ? 'Signing…' : data.approved ? 'Already approved' : 'Sign & approve'}
                </button>
              )}
              <Link className="btn btn-ghost" to="/agents">
                Agents docs
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

export default ApprovePage
