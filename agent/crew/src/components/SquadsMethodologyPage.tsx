import { Link } from 'react-router-dom'
import { CREW_VERSION, SQUADS_ENABLED } from '../lib/config'
import {
  SQUADS_DISCLAIMER_FALLBACK,
  SQUADS_DISPUTE_CONTACT,
} from '../lib/squads'

export function SquadsMethodologyPage() {
  if (!SQUADS_ENABLED) {
    return (
      <div className="app-shell page-squads">
        <section className="section section-squads">
          <p className="section-sub">Squads is not enabled on this build.</p>
          <Link className="btn btn-ghost btn-sm" to="/">
            Home
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="app-shell page-squads">
      <section className="section section-squads">
        <div className="launch-page-head-row">
          <Link className="launch-back" to="/squads">
            ← Squads
          </Link>
          <p className="section-label">Squads · v{CREW_VERSION}</p>
        </div>
        <h1 className="section-title">Anomaly score</h1>
        <div className="squads-method-prose">
          <p>
            Each squad gets an <strong>Anomaly score</strong> from 0 to 100. The score is an
            automated look at public on-chain activity on the board. A higher number means the
            squad’s pattern is more unusual relative to the rest of the field — not that anyone
            did anything wrong.
          </p>
          <p>Signals are public chain data only, at a high level:</p>
          <ul>
            <li>overlapping open tokens across squads</li>
            <li>same-window co-trading</li>
            <li>shared funders and newly funded wallets</li>
            <li>concentrated supply / exit-risk marks</li>
            <li>early-entry clustering after a token appears</li>
          </ul>
          <p>
            The score can be wrong, incomplete, or stale. It is statistical only. It is not proof
            of wrongdoing and not an accusation against any person or squad.
          </p>
          <p className="squads-disclaimer" data-testid="squads-disclaimer">
            {SQUADS_DISCLAIMER_FALLBACK}
          </p>
          <p>
            Corrections:{' '}
            <a href={`mailto:${SQUADS_DISPUTE_CONTACT}`}>{SQUADS_DISPUTE_CONTACT}</a>
          </p>
        </div>
      </section>
    </div>
  )
}
