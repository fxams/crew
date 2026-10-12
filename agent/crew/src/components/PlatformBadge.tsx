import {
  inferLaunchPlatform,
  platformDisplayName,
  platformMark,
  type LaunchPlatform,
} from '../lib/platforms'

type Props = {
  platform?: string | null
  pumpUrl?: string | null
  mint?: string | null
  compact?: boolean
}

/** Small venue chip — letter mark + name, forest/acid. */
export function PlatformBadge({ platform, pumpUrl, mint, compact }: Props) {
  const id: LaunchPlatform = inferLaunchPlatform({ platform, pumpUrl, mint })
  return (
    <span className={`plat-badge plat-${id}${compact ? ' is-compact' : ''}`} title={platformDisplayName(id)}>
      <span className="plat-mark" aria-hidden>
        {platformMark(id)}
      </span>
      {compact ? null : <span className="plat-name">{platformDisplayName(id)}</span>}
    </span>
  )
}
