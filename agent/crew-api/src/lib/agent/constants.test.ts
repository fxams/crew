import { describe, expect, it } from 'vitest'
import {
  CREW_LAUNCH_ATTRIBUTION,
  DESCRIPTION_HARD_MAX,
  USER_DESCRIPTION_MAX,
  withCrewLaunchDescription,
} from './constants.js'

describe('description attribution limits', () => {
  it('reserves room for separator + attribution under the hard max', () => {
    expect(CREW_LAUNCH_ATTRIBUTION.length).toBe(34)
    expect(USER_DESCRIPTION_MAX).toBe(
      DESCRIPTION_HARD_MAX - CREW_LAUNCH_ATTRIBUTION.length - 2,
    )
    expect(USER_DESCRIPTION_MAX).toBe(204)
  })

  it('keeps a max-length user vibe within the hard cap after attribution', () => {
    const user = 'a'.repeat(USER_DESCRIPTION_MAX)
    const final = withCrewLaunchDescription(user)
    expect(final.length).toBeLessThanOrEqual(DESCRIPTION_HARD_MAX)
    expect(final).toContain(CREW_LAUNCH_ATTRIBUTION)
  })

  it('does not double-append when attribution is already present', () => {
    const once = withCrewLaunchDescription(`hello. ${CREW_LAUNCH_ATTRIBUTION}`)
    expect(once.match(/Launched from CrewPay\.dev platform/g)?.length).toBe(1)
  })
})
