import { Link } from 'react-router-dom'
import { founderLabel } from '../lib/kol-hub-display'
import type { KolHubRecentJoiner, KolLeaderboardRow } from '../lib/kol-program'
import { kolProfilePath } from '../lib/routes'

type RankedProps = {
  kind: 'ranked'
  row: KolLeaderboardRow
  highlight?: boolean
  badge?: string | null
}

type JoinerProps = {
  kind: 'joiner'
  row: KolHubRecentJoiner
  highlight?: boolean
  badge?: string | null
}

function Avatar({ url, handle }: { url?: string | null; handle: string }) {
  const initial = (handle.slice(0, 1) || '?').toUpperCase()
  if (url) {
    return <img className="kol-board-avatar" src={url} alt="" width={32} height={32} loading="lazy" />
  }
  return (
    <span className="kol-board-avatar kol-board-avatar-fallback" aria-hidden>
      {initial}
    </span>
  )
}

export function KolBoardRow(props: RankedProps | JoinerProps) {
  const handle = props.row.handle
  const displayName =
    'displayName' in props.row && props.row.displayName ? String(props.row.displayName) : handle
  const avatarUrl = 'avatarUrl' in props.row ? props.row.avatarUrl : null
  const founder = founderLabel(props.row.founderNumber)
  const rank = props.kind === 'ranked' ? props.row.rank : founder || props.row.founderNumber
  const points = props.kind === 'ranked' ? props.row.seasonPoints : null
  const self = Boolean(props.highlight)
  const top = props.kind === 'ranked' && props.row.rank >= 1 && props.row.rank <= 3

  return (
    <li
      className={`kol-leaderboard-row kol-board-row${self ? ' is-self' : ''}${top ? ' is-top' : ''}`}
      data-testid={self ? 'kol-board-row-self' : 'kol-board-row'}
      data-handle={handle.toLowerCase()}
    >
      <span className="kol-leaderboard-rank">{rank}</span>
      <Avatar url={avatarUrl} handle={handle} />
      <span className="kol-leaderboard-handle">
        <Link to={kolProfilePath(handle)} className="kol-board-identity">
          <strong className="kol-board-name">{displayName}</strong>
          <span className="kol-board-handle">@{handle}</span>
        </Link>
        {founder ? (
          <span className="kol-founder-badge" title="Founding KOL">
            Founder {founder}
          </span>
        ) : null}
        {props.badge ? <span className="kol-hof-badge">{props.badge}</span> : null}
      </span>
      {points != null ? (
        <span className="kol-leaderboard-points">{points} pts</span>
      ) : (
        <span className="kol-leaderboard-points" />
      )}
    </li>
  )
}
