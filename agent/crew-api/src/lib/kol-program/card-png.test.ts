import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@resvg/resvg-js', () => ({
  Resvg: class {
    constructor() {}
    render() {
      return { asPng: () => Buffer.from([0x89, 0x50, 0x4e, 0x47]) }
    }
  },
}))

vi.mock('./card-from-handle.js', () => ({
  cardSvgForAnyHandle: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"></svg>'),
}))

vi.mock('./x-cache.js', () => ({
  getXJsonCache: vi.fn(async () => null),
  setXJsonCache: vi.fn(async () => {}),
}))

describe('cardPngForHandle', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns png bytes', async () => {
    const { cardPngForHandle } = await import('./card-png.js')
    const buf = await cardPngForHandle('alice')
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf?.[0]).toBe(0x89)
  })
})
