import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CREW_FARCASTER_URL,
  CREW_GITHUB_URL,
  CREW_TELEGRAM_COMMUNITY_URL,
  CREW_TELEGRAM_URL,
  CREW_X_URL,
} from './config'
import { headerKolLinks, mobileStickyCta } from './nav'

const here = dirname(fileURLToPath(import.meta.url))

describe('headerKolLinks', () => {
  it('keeps KOL on register when program flag is off', () => {
    expect(headerKolLinks(null)).toEqual([{ label: 'KOL', to: '/register' }])
    expect(headerKolLinks('')).toEqual([{ label: 'KOL', to: '/register' }])
  })

  it('points KOL at /kol when program flag is on (no extra header links)', () => {
    expect(headerKolLinks(null, { kolProgram: true })).toEqual([{ label: 'KOL', to: '/kol' }])
  })

  it('adds Desk next to KOL when the wallet is a registered handle', () => {
    expect(headerKolLinks('0x4dY')).toEqual([
      { label: 'KOL', to: '/register' },
      { label: 'My card', to: '/kol/0x4dY' },
      { label: 'Desk', to: '/kol/0x4dY' },
    ])
  })

  it('adds Desk when registered and program is on', () => {
    expect(headerKolLinks('0x4dY', { kolProgram: true })).toEqual([
      { label: 'KOL', to: '/kol' },
      { label: 'My card', to: '/kol/0x4dY' },
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

describe('header and footer socials', () => {
  it('points X, Farcaster, Telegram, and GitHub at the official CrewPay profiles', () => {
    expect(CREW_X_URL).toBe('https://x.com/CrewPayHQ')
    expect(CREW_FARCASTER_URL).toBe('https://farcaster.xyz/crewpay')
    expect(CREW_TELEGRAM_URL).toBe('https://t.me/CrewPayHQ')
    expect(CREW_TELEGRAM_COMMUNITY_URL).toBe('https://t.me/crewpay_hq')
    expect(CREW_GITHUB_URL).toBe('https://github.com/fxams/crew')
  })

  it('puts Farcaster then Telegram then GitHub next to X in the site nav', () => {
    const app = readFileSync(join(here, '../App.tsx'), 'utf8')
    const nav = app.slice(app.indexOf('<nav className="nav-links"'), app.indexOf('</nav>'))
    expect(nav).toContain('<NavSocialLinks />')
    expect(nav).not.toContain('/admin/farcaster')

    const socials = readFileSync(join(here, '../components/SocialIcons.tsx'), 'utf8')
    const xIdx = socials.indexOf('nav-link-x')
    const fcIdx = socials.indexOf('nav-link-fc')
    const tgIdx = socials.indexOf('nav-link-tg')
    const ghIdx = socials.indexOf('nav-link-gh')
    expect(xIdx).toBeGreaterThan(-1)
    expect(fcIdx).toBeGreaterThan(xIdx)
    expect(tgIdx).toBeGreaterThan(fcIdx)
    expect(ghIdx).toBeGreaterThan(tgIdx)
    expect(socials).toContain('aria-label="Farcaster @crewpay"')
    expect(socials).toContain('aria-label="Telegram @CrewPayHQ"')
    expect(socials).toContain('aria-label="GitHub fxams/crew"')
    expect(socials).toContain('CREW_FARCASTER_URL')
    expect(socials).toContain('CREW_TELEGRAM_URL')
    expect(socials).toContain('CREW_GITHUB_URL')
    expect(socials).toContain('<XLink')
    expect(socials).toContain('target="_blank"')
    expect(socials).toContain('M257.778 155.556H742.222V844.445')
    const navFn = socials.slice(
      socials.indexOf('export function NavSocialLinks'),
      socials.indexOf('/** Footer handles'),
    )
    expect(navFn).not.toContain('CREW_TELEGRAM_COMMUNITY_URL')
    expect(navFn).not.toContain('crewpay_hq')
  })

  it('adds Farcaster, Telegram, and Community beside @CrewPayHQ in footer socials', () => {
    const app = readFileSync(join(here, '../App.tsx'), 'utf8')
    expect(app).toContain('<FooterSocials />')
    const onepager = readFileSync(join(here, '../components/OnepagerPage.tsx'), 'utf8')
    expect(onepager).toContain('<FooterSocials />')
    const socials = readFileSync(join(here, '../components/SocialIcons.tsx'), 'utf8')
    expect(socials).toContain('<XLink href={CREW_X_URL}>')
    expect(socials).toMatch(/@CrewPayHQ[\s\S]*@crewpay[\s\S]*Telegram[\s\S]*Community[\s\S]*GitHub/)
    expect(socials).toContain('CREW_TELEGRAM_COMMUNITY_URL')
    expect(socials).toContain('CREW_GITHUB_URL')
  })
})
