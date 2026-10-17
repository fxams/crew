import { describe, expect, it } from 'vitest'
import { SHOW_SUI_LAUNCHPAD } from './config'

describe('SHOW_SUI_LAUNCHPAD', () => {
  it('defaults off unless VITE_SHOW_SUI_LAUNCHPAD is set at build time', () => {
    expect(SHOW_SUI_LAUNCHPAD).toBe(false)
  })
})
