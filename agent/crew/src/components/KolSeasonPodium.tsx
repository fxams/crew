import { Link } from 'react-router-dom'
import { podiumSlots } from '../lib/kol-hub-display'
import type { KolLeaderboardRow } from '../lib/kol-program'
import { kolProfilePath } from '../lib/routes'

function Avatar({ url, handle }: { url?: string | null; handle: string }) {
  const initial = (handle.slice(0, 1) || '?').toUpperCase()
  if (url) {
    return <img className="kol-podium-avatar" src={url} alt="" width={40} height={40} loading="lazy" />
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
            <div
              key={slot.place}
              className={`kol-podium-slot ${placeClass} is-placeholder`}
              aria-label={`#${slot.place} open`}
            >
              <span className="kol-podium-rank">#{slot.place}</span>
              <span className="kol-podium-ghost" aria-hidden />
            </div>
          )
        }
        const isSelf = Boolean(self && r.handle.toLowerCase() === self)
        return (
          <div
            key={r.handle}
            className={`kol-podium-slot ${placeClass}${isSelf ? ' is-self' : ''}`}
          >
            <span className="kol-podium-rank">#{r.rank}</span>
            <Avatar url={r.avatarUrl} handle={r.handle} />
            <Link to={kolProfilePath(r.handle)} className="kol-podium-handle">
              @{r.handle}
            </Link>
            <span className="kol-podium-points">{r.seasonPoints} pts</span>
          </div>
        )
      })}
    </div>
  )
}
