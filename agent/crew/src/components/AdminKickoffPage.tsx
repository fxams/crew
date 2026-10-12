import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import bs58 from 'bs58'
import { CREW_AGENT_API_URL, CREW_VERSION } from '../lib/config'
import { useConnectModal } from './ConnectModal'

type Proposal = {
  id: string
  mint: string
  label: string
  costSol: number
  costUsd?: number | null
  status: string
  payoutStatus?: string
  autoApproved?: boolean
  note?: string
}

type Audit = {
  id: string
  at: number
  action: string
  actor: string
  proposalId: string
  detail: string
}

export function AdminKickoffPage() {
  const wallet = useWallet()
  const { open } = useConnectModal()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [featMint, setFeatMint] = useState('')
  const [featUrl, setFeatUrl] = useState('')

  const signedHeaders = useCallback(
    async (message: string) => {
      if (!wallet.publicKey || !wallet.signMessage) throw new Error('Connect an approver wallet')
      const ts = Date.now()
      const msg = `${message}${ts}`
      const sig = await wallet.signMessage(new TextEncoder().encode(msg))
      return {
        'x-crew-wallet': wallet.publicKey.toBase58(),
        'x-crew-timestamp': String(ts),
        'x-crew-signature': bs58.encode(sig),
      }
    },
    [wallet],
  )

  async function load() {
    setBusy(true)
    setError(null)
    try {
      const headers = await signedHeaders('crew-kickoff-admin:')
      const res = await fetch(`${CREW_AGENT_API_URL}/api/admin/kickoff`, { headers })
      const data = (await res.json()) as { ok?: boolean; error?: string; proposals?: Proposal[]; audit?: Audit[] }
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Unauthorized')
      setProposals(data.proposals || [])
      setAudit(data.audit || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    } finally {
      setBusy(false)
    }
  }

  async function decide(id: string, action: 'approve' | 'reject') {
    setBusy(true)
    setError(null)
    try {
      const headers = await signedHeaders(`crew-kickoff-decide:${id}:${action}d:`)
      const res = await fetch(`${CREW_AGENT_API_URL}/api/admin/kickoff/${id}/${action}`, {
        method: 'POST',
        headers,
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; transfer?: unknown }
      if (data.transfer) throw new Error('Unexpected transfer payload')
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      setBusy(false)
    }
  }

  return (
    <div className="app-shell page-coin">
      <section className="section">
        <div className="launch-page-head-row">
          <Link className="launch-back" to="/coins">
            ← Coins
          </Link>
          <p className="section-label">Kickoff admin · v{CREW_VERSION}</p>
        </div>
        <h1 className="section-title">Kickoff queue</h1>
        <p className="section-sub">
          Approvals record intent and queue payout. CrewPay does not transfer treasury here.
          Auto-approves (CREW_KICKOFF_AUTO_USD) also queue only. Allowlist: CREWPAY_APPROVER_WALLETS.
        </p>
        <div className="coin-actions">
          {wallet.publicKey ? (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void load()}>
              {busy ? 'Loading…' : 'Load queue'}
            </button>
          ) : (
            <button className="btn btn-primary" type="button" onClick={() => open()}>
              Connect admin wallet
            </button>
          )}
        </div>
        {error ? (
          <p className="desk-msg desk-msg-error" role="alert">
            {error}
          </p>
        ) : null}
        <form
          className="coin-ca"
          style={{ flexWrap: 'wrap' }}
          onSubmit={(e) => {
            e.preventDefault()
            void (async () => {
              setBusy(true)
              setError(null)
              try {
                const headers = await signedHeaders(`crew-featured:${featMint.trim()}:`)
                const res = await fetch(
                  `${CREW_AGENT_API_URL}/api/admin/coins/${encodeURIComponent(featMint.trim())}/featured`,
                  {
                    method: 'POST',
                    headers: { ...headers, 'content-type': 'application/json' },
                    body: JSON.stringify({ url: featUrl.trim() }),
                  },
                )
                const data = (await res.json()) as { ok?: boolean; error?: string }
                if (!res.ok || data.ok === false) throw new Error(data.error || 'Featured failed')
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Featured failed')
              } finally {
                setBusy(false)
              }
            })()
          }}
        >
          <input
            aria-label="Mint"
            placeholder="mint"
            value={featMint}
            onChange={(e) => setFeatMint(e.target.value)}
          />
          <input
            aria-label="@CrewPayHQ post URL"
            placeholder="https://x.com/CrewPayHQ/status/…"
            value={featUrl}
            onChange={(e) => setFeatUrl(e.target.value)}
          />
          <button className="btn btn-ghost btn-sm" type="submit" disabled={busy || !featMint || !featUrl}>
            Set featured URL
          </button>
        </form>
        <p className="hint">Does not tweet. External routine posts from @CrewPayHQ, then stores the URL.</p>
        <ul className="coin-kickoff-list">
          {proposals.map((p) => (
            <li key={p.id}>
              <span>
                {p.label} · {p.status}
                {p.autoApproved ? ' (auto)' : ''} · {p.payoutStatus || 'none'}
              </span>
              <em>
                {p.costUsd != null ? `$${p.costUsd}` : `${p.costSol} SOL`}
                {p.status === 'pending' ? (
                  <>
                    {' '}
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => void decide(p.id, 'approve')}>
                      Approve
                    </button>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => void decide(p.id, 'reject')}>
                      Reject
                    </button>
                  </>
                ) : null}
              </em>
            </li>
          ))}
        </ul>
        {audit.length ? (
          <details className="coin-more" open>
            <summary>Audit log</summary>
            <ul className="coin-kickoff-list">
              {audit
                .slice()
                .reverse()
                .map((e) => (
                  <li key={e.id}>
                    <span>
                      {e.action} · {e.actor}
                    </span>
                    <em>{e.detail}</em>
                  </li>
                ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  )
}
