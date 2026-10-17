import { NOTIONAL_VALUE_DISCLAIMER, NOTIONAL_VALUE_FORMULA_DOC } from '../lib/kol-notional-value'

type Props = {
  /** Optional API override from GET /api/kol-program/status */
  steps?: string[]
}

export function KolNotionalFormulaNote({ steps }: Props) {
  const lines = steps?.length ? steps : [...NOTIONAL_VALUE_FORMULA_DOC.steps]
  return (
    <aside className="kol-notional-formula" data-testid="kol-notional-formula">
      <p className="kol-notional-formula-title">How notional influence value is calculated</p>
      <p className="kol-notional-formula-disclaimer">{NOTIONAL_VALUE_DISCLAIMER}</p>
      <ol className="kol-notional-formula-steps">
        {lines.map((s) => (
          <li key={s}>
            <code>{s}</code>
          </li>
        ))}
      </ol>
      <p className="kol-notional-formula-foot muted">
        Uses public X metrics only (followers, estimated impressions per post, engagement rate). Separate
        from creator-fee shares and the season pool.
      </p>
    </aside>
  )
}
