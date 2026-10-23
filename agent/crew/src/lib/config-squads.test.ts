import { describe, expect, it } from 'vitest'
import { SQUADS_ENABLED } from './config'

describe('SQUADS_ENABLED', () => {
  it('defaults off unless VITE_SQUADS_ENABLED is set at build time', () => {
    expect(SQUADS_ENABLED).toBe(false)
  })
})
