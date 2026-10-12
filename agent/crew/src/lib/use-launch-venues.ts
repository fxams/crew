import { useEffect, useState } from 'react'
import {
  FALLBACK_LAUNCH_VENUES,
  fetchLaunchVenues,
  type LaunchVenue,
} from './platforms'

/** Load supported launch venues from discovery/OpenAPI once per mount. */
export function useLaunchVenues(): LaunchVenue[] {
  const [venues, setVenues] = useState<LaunchVenue[]>(FALLBACK_LAUNCH_VENUES)
  useEffect(() => {
    let cancelled = false
    void fetchLaunchVenues()
      .then((next) => {
        if (!cancelled) setVenues(next)
      })
      .catch(() => {
        if (!cancelled) setVenues(FALLBACK_LAUNCH_VENUES)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return venues
}
