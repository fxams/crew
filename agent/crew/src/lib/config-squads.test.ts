import { describe, expect, it } from 'vitest'
import { SQUADS_ENABLED } from './config'

function viteSquadsEnabled(): boolean {
  const raw =
    (import.meta.env.VITE_SQUADS_ENABLED as string | undefined) ??
    process.env.VITE_SQUADS_ENABLED
  return raw === '1' || raw === 'true'
}

describe('SQUADS_ENABLED', () => {
  it('matches VITE_SQUADS_ENABLED at test / build time', () => {
    expect(SQUADS_ENABLED).toBe(viteSquadsEnabled())
  })
})
