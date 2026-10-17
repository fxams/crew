import { Link } from 'react-router-dom'
import { podiumSlots } from '../lib/kol-hub-display'
import type { KolLeaderboardRow } from '../lib/kol-program'
import { kolTierDisplayName, kolTierFrameClass } from '../lib/kol-tiers'
import { kolProfilePath } from '../lib/routes'

function Avatar({ url, handle }: { url?: string | null; handle: string }) {
  const initial = (handle.slice(0, 1) || '?').toUpperCase()
  if (url) {
    return <img className="kol-podium-avatar" src={url} alt="" width={56} height={56} loading="lazy" />
  }
  return (
    <span className="kol-podium-avatar kol-board-avatar-fallback" aria-hidden>
      {initial}
    </span>
  )
}

export function KolSeasonPodium({
  rows,
  highlightHandle,
}: {
  rows: KolLeaderboardRow[]
  highlightHandle?: string | null
}) {
  const slots = podiumSlots(rows)
  const self = highlightHandle?.trim().replace(/^@+/, '').toLowerCase() || ''

  return (
    <div className="kol-podium" aria-label="Top 3" data-testid="kol-season-podium">
      {slots.map((slot) => {
        const r = slot.row
        const placeClass = slot.place === 1 ? 'kol-podium-first' : 'kol-podium-side'
        if (!r) {
          return (
            <div key={slot.place} className={`kol-podium-slot ${placeClass} is-placeholder`}>
              <span className="kol-podium-rank">#{slot.place}</span>
              <div className="kol-podium-placeholder" aria-hidden />
              <span className="kol-podium-handle">Be the first</span>
            </div>
          )
        }
        const isSelf = self && r.handle.toLowerCase() === self
        return (
          <div
            key={r.handle}
            className={`kol-podium-slot ${placeClass} ${kolTierFrameClass(r.tier)}${isSelf ? ' is-self' : ''}`}
          >
            <span className="kol-podium-rank">#{r.rank}</span>
            <Avatar url={r.avatarUrl} handle={r.handle} />
            <Link to={kolProfilePath(r.handle)} className="kol-podium-handle">
              @{r.handle}
            </Link>
            <span className="kol-podium-tier">{kolTierDisplayName(r.tier)}</span>
            <span className="kol-podium-points">{r.seasonPoints} pts</span>
          </div>
        )
      })}
    </div>
  )
}
