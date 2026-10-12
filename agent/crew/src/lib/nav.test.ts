import { describe, expect, it } from 'vitest'
import { headerKolLinks, mobileStickyCta } from './nav'

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

describe('mobileStickyCta', () => {
  it('never uses the old Register as crew label', () => {
    expect(
      JSON.stringify(
        mobileStickyCta({
          registered: false,
          hide: false,
          deskOrClaim: true,
          onLaunchPage: false,
          launchLabel: 'Launch',
        }),
      ),
    ).not.toMatch(/Register as crew/i)
  })

  it('hides on register / coins / coin pages', () => {
    expect(
      mobileStickyCta({
        registered: false,
        hide: true,
        deskOrClaim: false,
        onLaunchPage: false,
        launchLabel: 'Launch',
      }),
    ).toBeNull()
  })

  it('shows Launch Coin on Desk once the wallet is a registered KOL', () => {
    expect(
      mobileStickyCta({
        registered: true,
        hide: false,
        deskOrClaim: true,
        onLaunchPage: false,
        launchLabel: 'Launch $HOOT',
      }),
    ).toEqual({ label: 'Launch Coin', action: 'go-launch' })
  })

  it('keeps the register CTA for logged-out desk visitors', () => {
    expect(
      mobileStickyCta({
        registered: false,
        hide: false,
        deskOrClaim: true,
        onLaunchPage: false,
        launchLabel: 'Launch',
      }),
    ).toEqual({ label: 'Register as KOL to get Paid', action: 'register' })
  })

  it('shows Launch Coin on any other page once registered', () => {
    expect(
      mobileStickyCta({
        registered: true,
        hide: false,
        deskOrClaim: false,
        onLaunchPage: false,
        launchLabel: 'Launch on mainnet',
      }),
    ).toEqual({ label: 'Launch Coin', action: 'go-launch' })
  })

  it('submits on the launch page', () => {
    expect(
      mobileStickyCta({
        registered: true,
        hide: false,
        deskOrClaim: false,
        onLaunchPage: true,
        launchLabel: 'Launch on mainnet',
      }),
    ).toEqual({ label: 'Launch on mainnet', action: 'submit' })
  })

  it('keeps Launch Coin for logged-out visitors off desk and claim', () => {
    expect(
      mobileStickyCta({
        registered: false,
        hide: false,
        deskOrClaim: false,
        onLaunchPage: false,
        launchLabel: 'Launch',
      }),
    ).toEqual({ label: 'Launch Coin', action: 'go-launch' })
  })
})
