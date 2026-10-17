import { createPortal } from 'react-dom'
import type { WireFeeSharePlan } from '../lib/pump/fees'

type Props = {
  plan: WireFeeSharePlan
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Pre-wallet confirm — explains Pump fee-share lock (reduces Blowfish false positives). */
export function WireFeesConfirmModal({ plan, busy, onConfirm, onCancel }: Props) {
  const sheet = (
    <div className="crew-connect-backdrop" onClick={onCancel} role="presentation">
      <div
        className="crew-connect-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wire-fees-confirm-title"
        data-testid="wire-fees-confirm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="crew-connect-handle" aria-hidden />
        <header className="crew-connect-head">
          <div>
            <h2 id="wire-fees-confirm-title">Confirm wire fees</h2>
            <p>
              Mainnet · Pump.fun fee-share lock. You are not sending tokens — you authorize how
              future creator fees split.
            </p>
          </div>
          <button type="button" className="crew-connect-x" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </header>

        <ul className="section-sub" style={{ margin: '0 0 1rem', paddingLeft: '1.1rem' }}>
          {plan.summaryLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        <p className="section-sub" style={{ fontSize: '0.85rem', opacity: 0.85 }}>
          Programs: {plan.programIds.map((id) => `${id.slice(0, 4)}…${id.slice(-4)}`).join(', ')}
          · Instructions: {plan.instructionLabels.join(' → ')}
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Opening wallet…' : 'Continue in wallet'}
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return sheet
  return createPortal(sheet, document.body)
}
