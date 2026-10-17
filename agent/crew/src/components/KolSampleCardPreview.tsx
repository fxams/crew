/** Static preview only — not a real member or live score. */
export function KolSampleCardPreview() {
  return (
    <div className="kol-sample-card kol-tier-pulse" aria-hidden="true">
      <div className="kol-sample-card-inner">
        <div className="kol-sample-avatar" />
        <div className="kol-sample-body">
          <p className="kol-sample-handle">@yourhandle</p>
          <p className="kol-sample-name">Your display name</p>
          <p className="kol-sample-founder">CrewPay KOL</p>
          <p className="kol-sample-score">
            <span className="kol-sample-score-num">—</span>
            <span className="kol-sample-score-label">reach</span>
          </p>
          <p className="kol-sample-tier">Pulse</p>
          <p className="kol-sample-url">crewpay.dev/ref/yourhandle</p>
        </div>
      </div>
      <p className="kol-sample-caption">Sample card — sign in with X to get yours</p>
    </div>
  )
}
