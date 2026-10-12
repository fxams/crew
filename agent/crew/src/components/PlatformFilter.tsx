import type { LaunchPlatform, LaunchVenue } from '../lib/platforms'

type Props = {
  venues: LaunchVenue[]
  value: LaunchPlatform | 'all'
  onChange: (id: LaunchPlatform | 'all') => void
}

/** Compact All / Pump / Bags / Zora filter for launch lists. */
export function PlatformFilter({ venues, value, onChange }: Props) {
  return (
    <div className="plat-filter" role="tablist" aria-label="Filter by launch platform">
      <button
        type="button"
        role="tab"
        aria-selected={value === 'all'}
        className={`plat-filter-btn${value === 'all' ? ' is-on' : ''}`}
        onClick={() => onChange('all')}
      >
        All
      </button>
      {venues.map((venue) => (
        <button
          key={venue.id}
          type="button"
          role="tab"
          aria-selected={value === venue.id}
          className={`plat-filter-btn${value === venue.id ? ' is-on' : ''}`}
          onClick={() => onChange(venue.id)}
        >
          {venue.name}
        </button>
      ))}
    </div>
  )
}
