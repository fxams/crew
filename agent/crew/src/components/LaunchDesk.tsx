import { useMemo, useState, type FormEvent } from 'react'
import { demoLaunch, LaunchValidationError } from '../lib/launch'
import type { Coin, CrewMember, CrewMode, Remit } from '../lib/types'
import { ModePicker } from './ModePicker'

type LaunchDeskProps = {
  onLaunched: (coin: Coin, remits: Remit[]) => void
}

type CrewRow = { handle: string; pct: string }

const emptyRow = (): CrewRow => ({ handle: '', pct: '' })

export function LaunchDesk({ onLaunched }: LaunchDeskProps) {
  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<CrewMode>('fee-split')
  const [rows, setRows] = useState<CrewRow[]>([
    { handle: '', pct: '50' },
    { handle: '', pct: '50' },
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<Coin | null>(null)

  const allocated = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.pct) || 0), 0),
    [rows],
  )

  function updateRow(index: number, patch: Partial<CrewRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addRow() {
    if (rows.length >= 5) return
    setRows((prev) => [...prev, emptyRow()])
  }

  function removeRow(index: number) {
    if (rows.length <= 1) return
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    setBusy(true)

    try {
      const crew: CrewMember[] = rows.map((row) => ({
        handle: row.handle,
        bps: Math.round((Number(row.pct) || 0) * 100),
      }))

      const { coin, remits } = await demoLaunch({
        name,
        ticker,
        description,
        mode,
        crew,
      })

      setSuccess(coin)
      onLaunched(coin, remits)
    } catch (err) {
      const message =
        err instanceof LaunchValidationError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Launch failed.'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="section desk" id="desk">
      <div className="section-head">
        <p className="eyebrow">The desk</p>
        <h2>Launch. Tag crew. Lock the cut.</h2>
        <p className="section-sub">
          Demo mint validates a clean 100% split and returns a fake CA. Mainnet path is stubbed —
          Pump IPFS → createV2 / fee-share → wallet sign.
        </p>
      </div>

      <form className="launch-form" onSubmit={onSubmit}>
        <div className="field-grid">
          <label className="field">
            <span>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Raid Frog"
              maxLength={32}
              required
            />
          </label>
          <label className="field">
            <span>Ticker</span>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="FROG"
              maxLength={13}
              required
            />
          </label>
        </div>

        <label className="field">
          <span>One-liner</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="CT frog. Crew gets paid on every trade."
            maxLength={280}
            rows={3}
          />
        </label>

        <div className="field">
          <span>Mode</span>
          <ModePicker value={mode} onChange={setMode} />
        </div>

        <div className="crew-block">
          <div className="crew-head">
            <span>Crew (max 5)</span>
            <span className={`alloc${allocated === 100 ? ' is-ok' : ''}`}>
              {allocated.toFixed(0)}% / 100%
            </span>
          </div>

          <div className="crew-rows">
            {rows.map((row, index) => (
              <div className="crew-row" key={`crew-${index}`}>
                <label className="field grow">
                  <span>X handle</span>
                  <input
                    value={row.handle}
                    onChange={(e) => updateRow(index, { handle: e.target.value })}
                    placeholder="@caller"
                    required
                  />
                </label>
                <label className="field pct">
                  <span>Split %</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={row.pct}
                    onChange={(e) => updateRow(index, { pct: e.target.value })}
                    required
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => removeRow(index)}
                  disabled={rows.length <= 1}
                  aria-label="Remove crew member"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={addRow}
            disabled={rows.length >= 5}
          >
            Add handle
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        {success ? (
          <div className="launch-success" role="status">
            <p className="success-kicker">Live on the desk (demo)</p>
            <p className="success-title">
              ${success.ticker} · {success.name}
            </p>
            <p className="success-ca">CA {success.ca}</p>
            <p className="success-note">
              Split locked at 100%. Remits are printing on the tape.
            </p>
          </div>
        ) : null}

        <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>
          {busy ? 'Minting demo…' : 'Demo launch'}
        </button>
      </form>
    </section>
  )
}
