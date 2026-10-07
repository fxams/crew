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
    expect(brandUrl('logo-mark.png')).toMatch(/brand\/logo-mark\.png$/)
  })

  it('ships PNG and JPG for every asset (not SVG-only)', () => {
    for (const asset of BRAND_ASSETS) {
      const labels = asset.formats.map((f) => f.label)
      expect(labels).toContain('PNG')
      expect(labels).toContain('JPG')
      expect(asset.formats.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('prefers a raster file for logo previews', () => {
    const logos = BRAND_ASSETS.filter((a) => a.kind === 'logo')
    for (const logo of logos) {
      expect(logo.file).toMatch(/\.(png|jpg)$/)
    }
  })

  it('keeps the acid-on-forest palette', () => {
    const hexes = BRAND_PALETTE.map((p) => p.hex.toUpperCase())
    expect(hexes).toContain('#08100C')
    expect(hexes).toContain('#C8FF3D')
    expect(hexes).toContain('#FFB84D')
  })
})
