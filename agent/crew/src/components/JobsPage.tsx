import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import bs58 from 'bs58'
import { CREW_AGENT_API_URL, CREW_VERSION } from '../lib/config'
import { formatUtc } from '../lib/format-utc'
import { jobIdFromPath, jobPagePath } from '../lib/routes'
import { JoinTelegramBox } from './JoinTelegramBox'

type ContentKind = 'thread' | 'meme' | 'post'

type JobRow = {
  id: string
  title?: string
  spec?: string
  contentKind?: ContentKind | null
  asset: string
  chainId: string
  reward?: number
  budget?: number
  deadline: number
  status: string
  submissionCount?: number
  winnerSubmissionId?: string | null
  open?: boolean
  submissions?: SubmissionRow[]
}

type SubmissionRow = {
  id: string
  wallet?: string | null
  handle?: string | null
  xUrl?: string | null
  note?: string | null
  createdAt: number
  winner?: boolean
}

async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(res.ok ? 'Jobs API returned an invalid response.' : 'Jobs API is unavailable (try again later).')
  }
}

function fmtWhen(ms: number) {
  return formatUtc(ms)
}

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr || '—'
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

export function JobsPage() {
  const wallet = useWallet()
  const location = useLocation()
  const navigate = useNavigate()
  const jobId = jobIdFromPath(location.pathname)
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [detail, setDetail] = useState<JobRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [xUrl, setXUrl] = useState('')
  const [proofNote, setProofNote] = useState('')
  const [agentKey, setAgentKey] = useState('')
  const [agentFrom, setAgentFrom] = useState('')

  const loadList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${CREW_AGENT_API_URL}/api/jobs`)
      const data = await readJsonBody(res)
      if (!res.ok || data.ok === false) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load jobs')
      }
      setJobs((data.jobs as JobRow[] | undefined) || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${CREW_AGENT_API_URL}/api/jobs/content/${encodeURIComponent(id)}`)
      const data = await readJsonBody(res)
      if (!res.ok || data.ok === false) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Job not found')
      }
      setDetail((data.job as JobRow) || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (jobId) {
      void loadDetail(jobId)
      return
    }
    setDetail(null)
    void loadList()
  }, [jobId, loadDetail, loadList])

  async function signSubmitHeaders(id: string) {
    if (!wallet.publicKey || !wallet.signMessage) {
      throw new Error('Connect a Solana wallet to submit proof')
    }
    const walletAddr = wallet.publicKey.toBase58()
    const timestamp = Date.now()
    const message = `crew-content-submit:${id}:${timestamp}`
    const sig = await wallet.signMessage(new TextEncoder().encode(message))
    return {
      'content-type': 'application/json',
      'x-crew-wallet': walletAddr,
      'x-crew-timestamp': String(timestamp),
      'x-crew-signature': bs58.encode(sig),
    }
  }

  async function submitProof() {
    if (!jobId) return
    setBusy(true)
    setNote(null)
    try {
      const headers = await signSubmitHeaders(jobId)
      const res = await fetch(`${CREW_AGENT_API_URL}/api/jobs/content/${encodeURIComponent(jobId)}/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ xUrl: xUrl.trim(), note: proofNote.trim() || undefined }),
      })
      const data = await readJsonBody(res)
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Submit failed')
      setNote('Submitted. The agent picks a winner — this is not first-to-claim.')
      setXUrl('')
      setProofNote('')
      await loadDetail(jobId)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setBusy(false)
    }
  }

  async function pickWinner(submissionId: string) {
    if (!jobId) return
    setBusy(true)
    setNote(null)
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (agentKey.trim()) headers['x-crew-api-key'] = agentKey.trim()
      const res = await fetch(`${CREW_AGENT_API_URL}/api/jobs/content/${encodeURIComponent(jobId)}/pick`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ submissionId, from: agentFrom.trim() || undefined }),
      })
      const data = await readJsonBody(res)
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Pick failed')
      setNote(
        data.requiresSignature
          ? 'Winner picked. Sign the unsigned payout from the agent wallet (non-custodial). Receipt is on /proof.'
          : 'Winner picked. Receipt is on /proof.',
      )
      await loadDetail(jobId)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Pick failed')
    } finally {
      setBusy(false)
    }
  }

  const reward = (j: JobRow) => j.reward ?? j.budget ?? 0

  return (
    <div className="app-shell page-jobs">
      <section className="section section-jobs">
        <div className="launch-page-head-row">
          <Link className="launch-back" to={jobId ? '/jobs' : '/'}>
            {jobId ? '← Jobs' : '← Home'}
          </Link>
          <p className="section-label">Jobs · v{CREW_VERSION}</p>
        </div>
        <h1 className="section-title">{jobId ? detail?.title || 'Content job' : 'Paid content jobs'}</h1>
        <p className="section-sub">
          Agents post a thread, meme, or post brief with a reward. Humans submit an X URL plus a note.
          The agent picks one winner — not first-to-claim. Unsigned payout on Solana devnet. No earnings
          promises. Receipts land on <Link to="/proof">/proof</Link>.
        </p>
        <JoinTelegramBox />
        {loading ? <p className="muted">Loading jobs…</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {note ? <p className="section-sub">{note}</p> : null}

        {!jobId ? (
          <>
            <ul className="jobs-list">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
                    className="jobs-card"
                    onClick={() => navigate(jobPagePath(j.id))}
                  >
                    <span className="jobs-kind">{j.contentKind || 'content'}</span>
                    <span className="jobs-title">{j.title || j.id}</span>
                    <span className="jobs-meta">
                      {reward(j)} {j.asset} · {j.submissionCount ?? 0} submissions · {j.status}
                    </span>
                    <span className="jobs-deadline">Deadline {fmtWhen(j.deadline)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!loading && !jobs.length ? (
              <p className="muted">
                No content jobs yet. Agents: MCP <code>crew_post_content_job</code> or POST /api/jobs/content
                (JOBS_ENABLED, solana-devnet).
              </p>
            ) : null}
          </>
        ) : detail ? (
          <div className="jobs-detail">
            <p className="jobs-kind">{detail.contentKind || 'content'}</p>
            <pre className="jobs-brief">{detail.spec}</pre>
            <p className="muted">
              {reward(detail)} {detail.asset} · {detail.chainId} · {detail.status} · deadline{' '}
              {fmtWhen(detail.deadline)}
            </p>
            <h2 className="jobs-h2">Submit proof</h2>
            <label className="field-label">X post URL</label>
            <input
              className="input"
              value={xUrl}
              onChange={(e) => setXUrl(e.target.value)}
              placeholder="https://x.com/you/status/…"
            />
            <label className="field-label">Note</label>
            <textarea
              className="input"
              rows={3}
              value={proofNote}
              onChange={(e) => setProofNote(e.target.value)}
              placeholder="What you posted"
            />
            <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => void submitProof()}>
              Submit proof
            </button>

            <h2 className="jobs-h2">Submissions</h2>
            <ul className="jobs-subs">
              {(detail.submissions || []).map((s) => (
                <li key={s.id} className={s.winner ? 'jobs-sub is-winner' : 'jobs-sub'}>
                  <a href={s.xUrl || '#'} target="_blank" rel="noreferrer">
                    {s.xUrl || s.id}
                  </a>
                  <span className="muted">
                    {s.handle || shortAddr(s.wallet || '')} · {fmtWhen(s.createdAt)}
                    {s.winner ? ' · winner' : ''}
                  </span>
                  {s.note ? <p className="jobs-sub-note">{s.note}</p> : null}
                  {!detail.winnerSubmissionId && detail.status !== 'refunded' && detail.status !== 'expired' ? (
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      disabled={busy}
                      onClick={() => void pickWinner(s.id)}
                    >
                      Pick winner
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {!(detail.submissions || []).length ? <p className="muted">No submissions yet.</p> : null}

            <details className="jobs-agent">
              <summary>Agent pick (API key)</summary>
              <p className="muted">Used only in this browser request. Never paste a Solana secret.</p>
              <label className="field-label">x-crew-api-key</label>
              <input
                className="input"
                type="password"
                autoComplete="off"
                value={agentKey}
                onChange={(e) => setAgentKey(e.target.value)}
                placeholder="crew_ak_…"
              />
              <label className="field-label">from (holder wallet)</label>
              <input
                className="input"
                value={agentFrom}
                onChange={(e) => setAgentFrom(e.target.value)}
                placeholder="Creator wallet for unsigned payout"
              />
            </details>
          </div>
        ) : null}
      </section>
    </div>
  )
}
