import { useCallback, useEffect, useState } from 'react'
import { kolTierDisplayName } from '../lib/kol-tiers'
import type { PublicKolCard } from '../lib/kol-program'
import { buildKolGrowthShareTweet } from '../lib/kol-share'
import { formatNotionalUsd, NOTIONAL_VALUE_DISCLAIMER } from '../lib/kol-notional-value'

type Props = {
  card: PublicKolCard
  portrait?: boolean
  showReplay?: boolean
}

function SegmentedMeter({ value }: { value: number | null }) {
  const segments = 12
  const filled =
    value == null ? 0 : Math.round((Math.max(0, Math.min(100, value)) / 100) * segments)
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
  const showRank = !card.unclaimed && card.rank != null && card.rank > 0
  const showMember =
    !card.unclaimed &&
    ((card.memberNumber != null && card.memberNumber > 0) || card.founderNumber != null)
  const globalRank = showRank ? `GLOBAL RANK #${card.rank!.toLocaleString('en-US')}` : null
  const member = showMember
    ? card.memberNumber != null && card.memberNumber > 0
      ? `MEMBER #${card.memberNumber.toLocaleString('en-US')}`
      : `FOUNDING #${String(card.founderNumber).padStart(3, '0')}`
    : null

  const shareUrl = buildKolGrowthShareTweet({ refLink: card.referralUrl })
  const hasUnavailable = card.scoreBars.some((b) => b.value == null)

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
            {globalRank ? <p>{globalRank}</p> : null}
            {member ? <p className="muted">{member}</p> : null}
            <span className="kol-influence-tier-pill">{tier}</span>
          </div>
        </header>

        <div className="kol-influence-identity">
          <div className="kol-influence-avatar-wrap">
            {card.avatarUrl ? (
              <img src={card.avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="kol-influence-avatar-fallback">@</span>
            )}
          </div>
          <div className="kol-influence-identity-copy">
            <p className="kol-influence-display-name">{card.displayName || card.handle}</p>
            <p className="kol-influence-handle">@{card.handle}</p>
          </div>
        </div>

        <div className="kol-influence-hero">
          <p className="kol-influence-kicker">Notional influence value</p>
          <p className="kol-influence-notional">{formatNotionalUsd(card.notionalInfluenceValueUsd)}</p>
          <p className="kol-influence-notional-disclaimer">{NOTIONAL_VALUE_DISCLAIMER}</p>
          <p className="kol-influence-secondary-metrics">
            Reach score <strong>{card.reachScore}</strong>
            <span aria-hidden> · </span>
            {card.seasonPoints.toLocaleString()} season pts
          </p>
        </div>

        <ul className="kol-influence-bars">
          {card.scoreBars.slice(0, 6).map((b) => (
            <li key={b.label} title={b.hint || undefined}>
              <span className="kol-influence-bar-label">{b.label}</span>
              <SegmentedMeter value={b.value} />
              <span className="kol-influence-bar-val">{b.value == null ? '—' : b.value}</span>
            </li>
          ))}
        </ul>
        {hasUnavailable ? (
          <p className="kol-influence-bars-hint">
            — needs recent public posts or a claimed card. Not a zero score.
          </p>
        ) : null}

        <a className="kol-influence-share-box" href={shareUrl} target="_blank" rel="noreferrer">
          Share your KOL card on X
        </a>

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
