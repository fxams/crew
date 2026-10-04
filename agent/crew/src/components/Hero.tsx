type HeroProps = {
  onLaunch: () => void
  onTape: () => void
}

export function Hero({ onLaunch, onTape }: HeroProps) {
  return (
    <header className="hero">
      <div className="hero-visual" aria-hidden="true">
        <div className="hero-grid" />
        <div className="hero-wave hero-wave-a" />
        <div className="hero-wave hero-wave-b" />
        <div className="hero-scan" />
      </div>

      <nav className="topnav">
        <a className="topnav-brand" href="#top">
          CREW
        </a>
        <div className="topnav-links">
          <a href="#desk">Desk</a>
          <a href="#tape">Tape</a>
          <a href="#modes">Modes</a>
        </div>
      </nav>

      <div className="hero-copy">
        <p className="brand-mark">CREW</p>
        <h1>Tag your crew. They get paid.</h1>
        <p className="hero-sub">
          Launch on Pump. Permanently split creator fees to up to five X handles. One mode. Public
          remits tape. Zero platform cut.
        </p>
        <div className="hero-cta">
          <button type="button" className="btn btn-primary" onClick={onLaunch}>
            Launch a coin
          </button>
          <button type="button" className="btn btn-ghost" onClick={onTape}>
            Watch the tape
          </button>
        </div>
      </div>
    </header>
  )
}
