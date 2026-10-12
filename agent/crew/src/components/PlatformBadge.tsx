import {
  inferLaunchPlatform,
  platformDisplayName,
  platformMark,
  platformShortName,
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
  const full = platformDisplayName(id)
  return (
    <span className={`plat-badge plat-${id}${compact ? ' is-compact' : ''}`} title={full}>
      <span className="plat-mark" aria-hidden>
        {platformMark(id)}
      </span>
      {compact ? null : (
        <>
          <span className="plat-name plat-name-full">{full}</span>
          <span className="plat-name plat-name-short">{platformShortName(id)}</span>
        </>
      )}
    </span>
  )
}
