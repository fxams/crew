import type { LaunchPlatform, LaunchVenue } from '../lib/platforms'
import { platformMark } from '../lib/platforms'

type Props = {
  venues: LaunchVenue[]
  value: LaunchPlatform
  onChange: (id: LaunchPlatform) => void
  /** Extra caption under the grid (tucked — keep the grid itself sparse). */
  hint?: string
}

/** Mode-grid-style venue picker. Disabled venues stay visible with a caption. */
export function PlatformSelect({ venues, value, onChange, hint }: Props) {
  return (
    <div className="field">
      <label>Launch on</label>
      <div className="mode-grid mode-grid-3 plat-select" role="radiogroup" aria-label="Launch platform">
        {venues.map((venue) => {
          const disabled = !venue.enabled
          const active = value === venue.id
          return (
            <button
              key={venue.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-disabled={disabled}
              disabled={disabled}
              className={`mode-option plat-option${active ? ' active' : ''}${disabled ? ' is-disabled' : ''}`}
              onClick={() => {
                if (!disabled) onChange(venue.id)
              }}
              title={disabled ? venue.note : venue.name}
            >
              <span className="plat-option-mark" aria-hidden>
                {platformMark(venue.id)}
              </span>
              <strong className="mode-full">{venue.name}</strong>
              <strong className="mode-short">{venue.name.replace('.fun', '').replace('.fm', '')}</strong>
              {venue.caption ? <em className="plat-caption">{venue.caption}</em> : null}
            </button>
          )
        })}
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}
