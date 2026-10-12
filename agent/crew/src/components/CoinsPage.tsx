import { Link } from 'react-router-dom'
import { CREW_VERSION } from '../lib/config'
import { LiveCoins } from './LiveCoins'

export function CoinsPage() {
  return (
    <div className="app-shell page-coins">
      <section className="section section-coins">
        <div className="launch-page-head-row">
          <Link className="launch-back" to="/">
            ← Home
          </Link>
          <p className="section-label">Launches · v{CREW_VERSION}</p>
        </div>
        <p className="section-sub">
          CrewPay-launched coins only. Market cap and 24h change come from public Dexscreener
          quotes (cached). Unknown values show --. Fee map stays 60% KOL crew / 15% launching
          agent / 25% treasury.
        </p>
        <LiveCoins limit={80} heading="All coins" allLink={false} layout="cards" pageSize={10} />
      </section>
    </div>
  )
}
