import { describe, expect, it } from 'vitest'
import { headerKolLinks } from './nav'

describe('headerKolLinks', () => {
  it('always keeps KOL pointing at the public register/info page', () => {
    expect(headerKolLinks(null)).toEqual([{ label: 'KOL', to: '/register' }])
    expect(headerKolLinks('')).toEqual([{ label: 'KOL', to: '/register' }])
  })

  it('adds Desk next to KOL when the wallet is a registered handle', () => {
    expect(headerKolLinks('0x4dY')).toEqual([
      { label: 'KOL', to: '/register' },
      { label: 'Desk', to: '/kol/0x4dY' },
    ])
  })
})
