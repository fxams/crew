import { describe, expect, it } from 'vitest'
import { BRAND_ASSETS, BRAND_PALETTE, brandUrl } from './brand'

describe('brand kit', () => {
  it('exposes logo, banner, and post selections', () => {
    const kinds = new Set(BRAND_ASSETS.map((a) => a.kind))
    expect(kinds.has('logo')).toBe(true)
    expect(kinds.has('banner')).toBe(true)
    expect(kinds.has('post')).toBe(true)
    expect(BRAND_ASSETS.length).toBeGreaterThanOrEqual(8)
  })

  it('builds URLs under the Vite base + brand/', () => {
    expect(brandUrl('logo-mark.svg')).toMatch(/brand\/logo-mark\.svg$/)
  })

  it('keeps the acid-on-forest palette', () => {
    const hexes = BRAND_PALETTE.map((p) => p.hex.toUpperCase())
    expect(hexes).toContain('#08100C')
    expect(hexes).toContain('#C8FF3D')
    expect(hexes).toContain('#FFB84D')
  })
})
