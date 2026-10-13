import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CREW_AGENT_API_URL, CREW_VERSION } from '../lib/config'
import {
  adminSecretFromSearch,
  connectedAsLabel,
  farcasterAdminHeaders,
  neynarClientId,
  parseSiwnSuccess,
  siwnEnabled,
  type SiwnSuccess,
} from '../lib/neynar-siwn'
import { NeynarSiwnButton } from './NeynarSiwnButton'

type Status = {
  connected: boolean
  fid?: number
  username?: string | null
}

function applyNoindex(): () => void {
  document.title = 'Farcaster admin — CREW'
  let meta = document.querySelector('meta[name="robots"]')
  const created = !meta
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'robots')
    document.head.appendChild(meta)
  }
  const prev = meta.getAttribute('content')
  meta.setAttribute('content', 'noindex, nofollow')
  return () => {
    if (created) meta?.remove()
    else if (prev) meta?.setAttribute('content', prev)
    else meta?.remove()
  }
}

export function AdminFarcasterPage() {
  const [params] = useSearchParams()
  const fromUrl = useMemo(() => adminSecretFromSearch(params.toString()), [params])
  const [token, setToken] = useState(fromUrl.token)
  const [nonce, setNonce] = useState(fromUrl.nonce)
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const clientId = neynarClientId()
  const showSiwn = siwnEnabled()

  useEffect(() => applyNoindex(), [])

  const secret = { token: token.trim(), nonce: nonce.trim() }
  const hasSecret = Boolean(secret.token || secret.nonce)

  const loadStatus = useCallback(async () => {
    const next = { token: token.trim(), nonce: nonce.trim() }
    if (!next.token && !next.nonce) {
      setError('Admin token or one-time nonce required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${CREW_AGENT_API_URL}/api/admin/farcaster`, {
        headers: farcasterAdminHeaders(next),
      })
      const data = (await res.json()) as Status & { ok?: boolean; error?: string }
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Unauthorized')
      setStatus({ connected: Boolean(data.connected), fid: data.fid, username: data.username })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status failed')
    } finally {
      setBusy(false)
    }
  }, [token, nonce])

  async function persist(success: SiwnSuccess) {
    setBusy(true)
    setError(null)
    try {
      const parsed = parseSiwnSuccess(success)
      if (!parsed) throw new Error('SIWN did not return a signer')
      if (!hasSecret) throw new Error('Admin token or one-time nonce required')
      const res = await fetch(`${CREW_AGENT_API_URL}/api/admin/farcaster`, {
        method: 'POST',
        headers: farcasterAdminHeaders(secret),
        body: JSON.stringify({
          signer_uuid: parsed.signer_uuid,
          fid: parsed.fid,
          username: parsed.username,
        }),
      })
      const data = (await res.json()) as Status & { ok?: boolean; error?: string }
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Connect failed')
      setStatus({ connected: true, fid: data.fid ?? parsed.fid, username: data.username ?? parsed.username })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connect failed')
    } finally {
      setBusy(false)
    }
  }

  const connectedText =
    status?.connected && status.fid
      ? connectedAsLabel(status.username, status.fid)
      : null

  return (
    <div className="app-shell page-coin page-farcaster">
      <section className="section">
        <div className="launch-page-head-row">
          <Link className="launch-back" to="/">
            ← Home
          </Link>
          <p className="section-label">Farcaster admin · v{CREW_VERSION}</p>
        </div>
        <h1 className="section-title">Farcaster signer</h1>
        <p className="section-sub">
          Unlisted operator page. Sign in with Neynar stores a write signer on the API. The Neynar
          API key stays server-side.
        </p>

        <div className="farcaster-connect">
          <div className="field">
            <label htmlFor="farcaster-admin-secret">Admin token or one-time nonce</label>
            <input
              id="farcaster-admin-secret"
              type="password"
              autoComplete="off"
              inputMode="text"
              placeholder="from ?token= or ?nonce="
              value={token || nonce}
              onChange={(e) => {
                const v = e.target.value
                if (fromUrl.nonce && !fromUrl.token) setNonce(v)
                else setToken(v)
              }}
            />
          </div>
          <div className="coin-actions">
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              disabled={busy || !hasSecret}
              onClick={() => void loadStatus()}
            >
              Load status
            </button>
          </div>
          <p className="hint">
            Pass <code>?token=</code> (CREW_ADMIN_TOKEN) or a one-time <code>?nonce=</code>. Never
            put Neynar server credentials in VITE_* env.
          </p>

          {connectedText ? (
            <p className="farcaster-status hint is-ok" role="status">
              {connectedText}
            </p>
          ) : (
            <p className="hint">Not connected yet.</p>
          )}

          {showSiwn ? (
            <NeynarSiwnButton
              clientId={clientId}
              onSuccess={(raw) => {
                const parsed = parseSiwnSuccess(raw)
                if (!parsed) {
                  setError('SIWN did not return signer_uuid + fid')
                  return
                }
                void persist(parsed)
              }}
            />
          ) : (
            <p className="hint">Set VITE_NEYNAR_CLIENT_ID to show Sign in with Neynar.</p>
          )}

          {error ? (
            <p className="desk-msg desk-msg-error" role="alert">
              {error}
            </p>
          ) : null}
          {busy ? <p className="hint">Working…</p> : null}
        </div>
      </section>
    </div>
  )
}
