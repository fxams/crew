import { useCallback, useEffect, useState } from 'react'
import { kolTierDisplayName } from '../lib/kol-tiers'
import type { PublicKolCard } from '../lib/kol-program'
import { buildKolGrowthShareTweet } from '../lib/kol-share'

type Props = {
  card: PublicKolCard
  portrait?: boolean
  showReplay?: boolean
}

function SegmentedMeter({ value }: { value: number }) {
  const segments = 12
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * segments)
  return (
    <div className="kol-meter" aria-hidden>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={i < filled ? 'kol-meter-on' : 'kol-meter-off'} />
      ))}
    </div>
  )
}

export function KolInfluenceCard({ card, portrait = true, showReplay = true }: Props) {
  const [revealed, setRevealed] = useState(false)
  const storageKey = `crew.kol.reveal.${card.handle.toLowerCase()}`

  useEffect(() => {
    try {
      if (sessionStorage.getItem(storageKey) === '1') setRevealed(true)
      else {
        const t = window.setTimeout(() => {
          setRevealed(true)
          sessionStorage.setItem(storageKey, '1')
        }, 80)
        return () => window.clearTimeout(t)
      }
    } catch {
      setRevealed(true)
    }
  }, [storageKey])

  const replay = useCallback(() => {
    setRevealed(false)
    window.requestAnimationFrame(() => {
      window.setTimeout(() => setRevealed(true), 40)
    })
  }, [])

  const tier = kolTierDisplayName(card.tier)
  const globalRank =
    card.rank != null && card.rank > 0 ? `GLOBAL RANK #${card.rank.toLocaleString('en-US')}` : 'GLOBAL RANK —'
  const member =
    card.memberNumber != null
      ? `MEMBER #${card.memberNumber.toLocaleString('en-US')}`
      : card.founderNumber != null
        ? `FOUNDING #${String(card.founderNumber).padStart(3, '0')}`
        : 'MEMBER —'

  const shareUrl = buildKolGrowthShareTweet({ refLink: card.referralUrl })

  const rootClass = [
    'kol-influence-card',
    portrait ? 'kol-influence-card-portrait' : 'kol-influence-card-landscape',
    revealed ? 'is-revealed' : 'is-revealing',
  ].join(' ')

  return (
    <div className={rootClass} data-testid="kol-influence-card">
      <div className="kol-influence-frame">
        <header className="kol-influence-head">
          <div>
            <p className="kol-influence-brand">CREWPAY KOL</p>
            <p className="kol-influence-tagline">Real reach · season points · no cash value</p>
          </div>
          <div className="kol-influence-rank-block">
            <p>{globalRank}</p>
            <p className="muted">{member}</p>
            <span className="kol-influence-tier-pill">{tier}</span>
          </div>
        </header>

        <div className="kol-influence-hero">
          <p className="kol-influence-kicker">Reach score</p>
          <p className="kol-influence-score">{card.reachScore}</p>
          <p className="kol-influence-points">{card.seasonPoints.toLocaleString()} season pts</p>
        </div>

        <ul className="kol-influence-bars">
          {card.scoreBars.slice(0, 6).map((b) => (
            <li key={b.label}>
              <span className="kol-influence-bar-label">{b.label}</span>
              <SegmentedMeter value={b.value} />
              <span className="kol-influence-bar-val">{b.value}</span>
            </li>
          ))}
        </ul>

        <div className="kol-influence-profile">
          <div className="kol-influence-avatar-wrap">
            {card.avatarUrl ? (
              <img src={card.avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="kol-influence-avatar-fallback">@</span>
            )}
          </div>
          <p className="kol-influence-display-name">{card.displayName || card.handle}</p>
          <p className="kol-influence-handle">@{card.handle}</p>
          <p className="kol-influence-quote">
            {card.unclaimed ? 'Claim your card · CrewPay KOL' : 'Reach is a signal · use it wisely'}
          </p>
          <a className="kol-influence-share-box" href={shareUrl} target="_blank" rel="noreferrer">
            Share your KOL card on X
          </a>
        </div>

        <footer className="kol-influence-foot">CREWPAY.DEV</footer>
      </div>
      {showReplay ? (
        <button type="button" className="kol-influence-replay" onClick={replay}>
          Replay the reveal
        </button>
      ) : null}
    </div>
  )
}
