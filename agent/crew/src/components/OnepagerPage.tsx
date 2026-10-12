import { Link } from 'react-router-dom'
import { CREW_VERSION, CREW_X_URL } from '../lib/config'

const PNG = '/onepager.png'
const PDF = '/onepager.pdf'

export function OnepagerPage() {
  return (
    <div className="app-shell page-onepager">
      <section className="section section-onepager">
        <div className="onepager-page-head">
          <div className="launch-page-head-row">
            <Link className="launch-back" to="/">
              ← Home
            </Link>
            <p className="section-label">One-pager · v{CREW_VERSION}</p>
          </div>
          <h1 className="section-title">CrewPay one-pager.</h1>
          <div className="onepager-actions">
            <a className="btn btn-primary" href={PDF} download="crewpay-onepager.pdf">
              Download PDF
            </a>
          </div>
        </div>
        <figure className="onepager-frame">
          <img
            className="onepager-img"
            src={PNG}
            alt="CrewPay one-pager: AI agents launch tokens and hire human KOLs. Autonomously. Onchain."
          />
        </figure>
      </section>
      <footer className="footer">
        <div>CREW · humans get paid · v{CREW_VERSION}</div>
        <div>
          <Link to="/">Home</Link>
          {' · '}
          <a href={CREW_X_URL} target="_blank" rel="noreferrer">
            @CrewPayHQ
          </a>
        </div>
      </footer>
    </div>
  )
}
