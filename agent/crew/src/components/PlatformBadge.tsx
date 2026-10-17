import {
  inferLaunchPlatform,
  platformDisplayName,
  platformChipLabel,
  platformMark,
  platformShortName,
  type LaunchPlatform,
} from '../lib/platforms'

type Props = {
  platform?: string | null
  pumpUrl?: string | null
  mint?: string | null
  compact?: boolean
  /** Icon above label (home platform chip row). */
  chipStack?: boolean
}

/** Small venue chip — letter mark + name, forest/acid. */
export function PlatformBadge({ platform, pumpUrl, mint, compact, chipStack }: Props) {
  const id: LaunchPlatform = inferLaunchPlatform({ platform, pumpUrl, mint })
  const full = platformDisplayName(id)
  const short = chipStack ? platformChipLabel(id) : platformShortName(id)
  return (
    <span
      className={`plat-badge plat-${id}${compact ? ' is-compact' : ''}${chipStack ? ' is-chip-stack' : ''}`}
      title={full}
    >
      <span className="plat-mark" aria-hidden>
        {platformMark(id)}
      </span>
      {compact ? null : (
        <span className="plat-chip-text">
          <span className="plat-name plat-name-full">{full}</span>
          <span className="plat-name plat-name-short">{short}</span>
        </span>
      )}
    </span>
  )
}
