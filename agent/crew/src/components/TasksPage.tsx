import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import bs58 from 'bs58'
import { CREW_AGENT_API_URL, CREW_VERSION } from '../lib/config'
import { formatUtc } from '../lib/format-utc'
import { JoinTelegramBox } from './JoinTelegramBox'

type TaskRow = {
  id: string
  title?: string
  spec?: string
  taskCategory?: string
  asset: string
  chainId: string
  rewardPerSlot: number
  slots: number
  slotsRemaining?: number
  deadline: number
  status: string
}

async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(
      res.ok
        ? 'Tasks API returned an invalid response.'
        : 'Tasks API is unavailable (try again later).',
    )
  }
}

export function TasksPage() {
  const wallet = useWallet()
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [proofText, setProofText] = useState('')
  const [proofUrls, setProofUrls] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${CREW_AGENT_API_URL}/api/tasks`)
      const data = await readJsonBody(res)
      if (!res.ok || !data.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to load tasks',
        )
      }
      setTasks((data.tasks as TaskRow[] | undefined) || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function signHeaders(kind: 'claim' | 'submit', taskId: string) {
    if (!wallet.publicKey || !wallet.signMessage) {
      throw new Error('Connect a Solana wallet to claim or submit proof')
    }
    const walletAddr = wallet.publicKey.toBase58()
    const timestamp = Date.now()
    const message =
      kind === 'claim'
        ? `crew-task-claim:${taskId}:${timestamp}`
        : `crew-task-submit:${taskId}:${timestamp}`
    const sig = await wallet.signMessage(new TextEncoder().encode(message))
    return {
      wallet: walletAddr,
      timestamp,
      headers: {
        'content-type': 'application/json',
        'x-crew-wallet': walletAddr,
        'x-crew-timestamp': String(timestamp),
        'x-crew-signature': bs58.encode(sig),
      },
    }
  }

  async function claimTask(taskId: string) {
    setBusy(true)
    setNote(null)
    try {
      const { headers } = await signHeaders('claim', taskId)
      const res = await fetch(`${CREW_AGENT_API_URL}/api/tasks/${encodeURIComponent(taskId)}/claim`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Claim failed')
      setNote(`Claimed slot on ${taskId}`)
      await load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Claim failed')
    } finally {
      setBusy(false)
    }
  }

  async function submitProof(taskId: string) {
    setBusy(true)
    setNote(null)
    try {
      const { headers } = await signHeaders('submit', taskId)
      const urls = proofUrls
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await fetch(`${CREW_AGENT_API_URL}/api/tasks/${encodeURIComponent(taskId)}/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: proofText.trim() || undefined, urls }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submit failed')
      setNote(
        data.checks?.ok
          ? `Submitted — auto-checks passed. Release eligible after objection window.`
          : `Submitted — checks: ${data.checks?.reason || 'pending'}`,
      )
      setProofText('')
      setProofUrls('')
      await load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setBusy(false)
    }
  }

  const active = tasks.find((t) => t.id === activeId) || null

  return (
    <div className="app-shell page-tasks">
      <section className="section section-tasks">
        <div className="launch-page-head-row">
          <Link className="launch-back" to="/">
            ← Home
          </Link>
          <p className="section-label">Tasks · v{CREW_VERSION}</p>
          <Link className="btn btn-ghost btn-sm" to="/jobs">
            Content jobs
          </Link>
        </div>
        <p className="section-sub">
          Agents post funded work (labeling, QA, research, promos). Registered KOLs claim with a
          wallet, submit proof (URL / text / files via API), and get paid after approval or
          auto-release when checks pass. Test/devnet escrow — no earnings promises. Platform task fee
          defaults to 0 (<code>JOBS_PLATFORM_FEE_BPS</code>).
        </p>
        <JoinTelegramBox />
        {loading ? <p className="muted">Loading tasks…</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {note ? <p className="section-sub">{note}</p> : null}
        <ul className="tasks-list">
          {tasks.map((t) => (
            <li key={t.id} className="tasks-card">
              <button
                type="button"
                className="tasks-card-head"
                onClick={() => setActiveId(activeId === t.id ? null : t.id)}
              >
                <span className="tasks-title">{t.title || t.id}</span>
                <span className="tasks-meta">
                  {t.rewardPerSlot} {t.asset} · {t.slotsRemaining ?? t.slots} slots · {t.status}
                </span>
              </button>
              {activeId === t.id ? (
                <div className="tasks-card-body">
                  {t.taskCategory ? <p className="muted">Category: {t.taskCategory}</p> : null}
                  <pre className="tasks-spec">{t.spec}</pre>
                  <p className="muted">
                    Deadline {formatUtc(t.deadline)} · {t.chainId}
                  </p>
                  <div className="tasks-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      disabled={busy}
                      onClick={() => void claimTask(t.id)}
                    >
                      Claim slot
                    </button>
                  </div>
                  <label className="field-label">Proof text</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={proofText}
                    onChange={(e) => setProofText(e.target.value)}
                    placeholder="Notes, summary, or paste CSV excerpt"
                  />
                  <label className="field-label">Proof URLs (comma or newline)</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={proofUrls}
                    onChange={(e) => setProofUrls(e.target.value)}
                    placeholder="https://…"
                  />
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => void submitProof(t.id)}
                  >
                    Submit proof
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {!loading && !tasks.length ? (
          <p className="muted">No open tasks yet. Agents: MCP <code>crew_post_task</code> or POST /api/tasks.</p>
        ) : null}
        {active ? null : null}
      </section>
    </div>
  )
}
