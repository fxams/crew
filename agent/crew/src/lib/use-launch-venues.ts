import { useEffect, useState } from 'react'
import { FALLBACK_ACP, type AcpInfo } from './acp'
import {
  FALLBACK_LAUNCH_VENUES,
  fetchLaunchDiscovery,
  type LaunchVenue,
} from './platforms'
import { FALLBACK_X402, type X402Info } from './x402'

export type LaunchDiscoveryState = {
  venues: LaunchVenue[]
  x402: X402Info
  acp: AcpInfo
}

const FALLBACK_DISCOVERY: LaunchDiscoveryState = {
  venues: FALLBACK_LAUNCH_VENUES,
  x402: FALLBACK_X402,
  acp: FALLBACK_ACP,
}

/** Load venues + x402 prices/networks from discovery once per mount. */
export function useLaunchDiscovery(): LaunchDiscoveryState {
  const [state, setState] = useState<LaunchDiscoveryState>(FALLBACK_DISCOVERY)
  useEffect(() => {
    let cancelled = false
    void fetchLaunchDiscovery()
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch(() => {
        if (!cancelled) setState(FALLBACK_DISCOVERY)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

/** Load supported launch venues from discovery/OpenAPI once per mount. */
export function useLaunchVenues(): LaunchVenue[] {
  return useLaunchDiscovery().venues
}

export function useX402Info(): X402Info {
  return useLaunchDiscovery().x402
}
