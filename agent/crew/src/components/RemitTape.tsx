import { MODE_LABEL, type Coin, type Remit } from '../lib/types'

type RemitTapeProps = {
  coins: Coin[]
  remits: Remit[]
}

function timeAgo(at: number): string {
  const mins = Math.max(0, Math.round((Date.now() - at) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export function RemitTape({ coins, remits }: RemitTapeProps) {
  const live = coins.length
  const paid = new Set(remits.map((r) => r.handle)).size
  const totalUsd = remits.reduce((sum, r) => sum + r.amountUsd, 0)

  return (
    <section className="section tape" id="tape">
      <div className="section-head">
        <p className="eyebrow">Public tape</p>
        <h2>Remits the timeline can screenshot.</h2>
        <p className="section-sub">
          Every print is a handle, a ticker, and a number. CT content without a thread.
        </p>
      </div>

      <div className="tape-stats">
        <div>
          <span className="stat-label">Crews live</span>
          <strong>{live}</strong>
        </div>
        <div>
          <span className="stat-label">Remitted</span>
          <strong>${totalUsd.toFixed(2)}</strong>
        </div>
        <div>
          <span className="stat-label">Handles paid</span>
          <strong>{paid}</strong>
        </div>
      </div>

      <div className="tape-board" aria-live="polite">
        {remits.map((remit, index) => (
          <article
            className="tape-row"
            key={remit.id}
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
          >
            <div className="tape-main">
              <span className="tape-ticker">${remit.ticker}</span>
              <span className="tape-arrow">→</span>
              <span className="tape-handle">@{remit.handle}</span>
            </div>
            <div className="tape-meta">
              <span className="tape-usd">≈ ${remit.amountUsd.toFixed(2)}</span>
              <span className="tape-sol">{remit.amountSol.toFixed(4)} SOL</span>
              <span className="tape-mode">{MODE_LABEL[remit.mode]}</span>
              <span className="tape-time">{timeAgo(remit.at)}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="desk-table-wrap">
        <h3>On the desk</h3>
        <table className="desk-table">
          <thead>
            <tr>
              <th>Coin</th>
              <th>Mode</th>
              <th>Crew</th>
              <th>CA</th>
            </tr>
          </thead>
          <tbody>
            {coins.map((coin) => (
              <tr key={coin.id}>
                <td>
                  <strong>${coin.ticker}</strong>
                  <span className="muted"> {coin.name}</span>
                </td>
                <td>{MODE_LABEL[coin.mode]}</td>
                <td>
                  {coin.crew
                    .map((m) => `@${m.handle} ${(m.bps / 100).toFixed(0)}%`)
                    .join(' · ')}
                </td>
                <td className="mono ca-cell">{coin.ca.slice(0, 6)}…{coin.ca.slice(-4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
