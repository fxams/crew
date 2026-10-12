import { useState } from 'react'
import {
  formatX402Networks,
  x402KeyLabel,
  x402LaunchCurl,
  x402PayLabel,
  x402SnippetNote,
  type X402Info,
} from '../lib/x402'

export type AgentAuth = 'key' | 'x402'

type Props = {
  x402: X402Info
  compact?: boolean
  value?: AgentAuth
  onChange?: (auth: AgentAuth) => void
}

/** API key vs x402 — compact pills, snippet tucked in details-quiet. */
export function AuthChoice({ x402, compact, value, onChange }: Props) {
  const [internal, setInternal] = useState<AgentAuth>('key')
  const auth = value ?? internal

  function setAuth(next: AgentAuth) {
    if (value === undefined) setInternal(next)
    onChange?.(next)
  }

  const payLabel = x402PayLabel(x402)

  return (
    <div className={`field auth-choice${compact ? ' is-compact' : ''}`}>
      <label>Auth</label>
      <div className="plat-filter plat-chip-row auth-chip-row" role="radiogroup" aria-label="Auth">
        <button
          type="button"
          role="radio"
          aria-checked={auth === 'key'}
          className={`plat-filter-btn${auth === 'key' ? ' is-on' : ''}`}
          onClick={() => setAuth('key')}
        >
          {x402KeyLabel()}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={auth === 'x402'}
          className={`plat-filter-btn plat-x402-btn${auth === 'x402' ? ' is-on' : ''}`}
          onClick={() => setAuth('x402')}
          title={payLabel}
        >
          <span className="auth-choice-title">x402 pay per call</span>
          <span className="auth-choice-meta">
            ({x402.prices.launch} {x402.asset}, {formatX402Networks(x402.networks)})
          </span>
        </button>
      </div>
      {compact ? null : auth === 'x402' ? (
        <details className="details-quiet">
          <summary>x402 snippet</summary>
          <p className="hint">{x402SnippetNote(x402)}</p>
          <pre>{x402LaunchCurl(x402)}</pre>
        </details>
      ) : (
        <p className="hint">Claim a crew_ak_… key, or pay per call with x402 — no key.</p>
      )}
    </div>
  )
}
