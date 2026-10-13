import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  TELEGRAM_BOT_USERNAME,
  allowTelegramWidgetIframe,
  isTelegramWidgetAuth,
  stripTelegramAuthParams,
  telegramAuthFromLocation,
  telegramAuthFromSearchParams,
  telegramOauthUrl,
} from './telegram-login'

const here = dirname(fileURLToPath(import.meta.url))

describe('Telegram login widget payload', () => {
  it('accepts a Login Widget user object and rejects publicKey-only junk', () => {
    expect(
      isTelegramWidgetAuth({
        id: 1,
        first_name: 'Ada',
        auth_date: 1_700_000_000,
        hash: 'abc',
      }),
    ).toBe(true)
    expect(isTelegramWidgetAuth({ publicKey: 'not-telegram' })).toBe(false)
    expect(TELEGRAM_BOT_USERNAME).toBe('CrewPay_Bot')
  })

  it('builds an oauth.telegram.org redirect and parses the return query', () => {
    const href = telegramOauthUrl({
      botId: 123456,
      origin: 'https://crewpay.dev',
      returnTo: 'https://crewpay.dev/register',
    })
    expect(href).toContain('https://oauth.telegram.org/auth')
    expect(href).toContain('bot_id=123456')
    expect(href).toContain('origin=https%3A%2F%2Fcrewpay.dev')
    expect(href).toContain('embed=0')
    const auth = telegramAuthFromSearchParams(
      new URLSearchParams('id=9&first_name=Ada&auth_date=1700000000&hash=deadbeef&ref=alice'),
    )
    expect(auth?.id).toBe(9)
    expect(auth?.first_name).toBe('Ada')
    const stripped = stripTelegramAuthParams(
      new URLSearchParams('id=9&first_name=Ada&hash=deadbeef&ref=alice'),
    )
    expect(stripped.get('ref')).toBe('alice')
    expect(stripped.get('hash')).toBeNull()
    const fromHash = telegramAuthFromLocation(
      new URLSearchParams(),
      '#tgAuthResult=' +
        encodeURIComponent(
          JSON.stringify({ id: 9, first_name: 'Ada', auth_date: 1_700_000_000, hash: 'deadbeef' }),
        ),
    )
    expect(fromHash?.id).toBe(9)
    expect(fromHash?.first_name).toBe('Ada')
    const rawJson = telegramAuthFromLocation(
      new URLSearchParams(),
      '#{"id":8,"first_name":"Ada","auth_date":1700000000,"hash":"deadbeef"}',
    )
    expect(rawJson?.id).toBe(8)
  })

  it('keeps the official widget iframe off mobile and in-app browsers', () => {
    expect(allowTelegramWidgetIframe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(false)
    expect(allowTelegramWidgetIframe('Mozilla/5.0 (Linux; Android 14) Phantom')).toBe(false)
    expect(
      allowTelegramWidgetIframe(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0',
      ),
    ).toBe(true)
  })

  it('allows Telegram widget script + oauth iframe in CSP', () => {
    const html = readFileSync(join(here, '../../index.html'), 'utf8')
    expect(html).toContain('https://telegram.org')
    expect(html).toContain('https://oauth.telegram.org')
    expect(html).toMatch(/script-src[^"]*https:\/\/telegram\.org/)
    expect(html).toMatch(/frame-src[^"]*https:\/\/oauth\.telegram\.org/)
    expect(html).toMatch(/form-action[^"]*https:\/\/oauth\.telegram\.org/)
  })

  it('always ships a visible Continue with Telegram oauth link on /register', () => {
    const login = readFileSync(join(here, '../components/TelegramLogin.tsx'), 'utf8')
    const page = readFileSync(join(here, '../components/KolRegisterPage.tsx'), 'utf8')
    const css = readFileSync(join(here, '../index.css'), 'utf8')
    expect(login).toContain('Continue with Telegram')
    expect(login).toContain('telegramOauthUrl')
    expect(login).toContain('data-testid="telegram-continue"')
    expect(login).toContain('allowTelegramWidgetIframe')
    expect(page).toContain('<TelegramLogin')
    expect(page).toContain('label="Continue with Telegram"')
    expect(page).not.toMatch(/telegramLogin\s*&&\s*\(?\s*<TelegramLogin/)
    expect(css).toContain('.telegram-continue-btn')
    expect(css).toMatch(/\.desk-telegram-card[\s\S]*grid-column:\s*1\s*\/\s*-1/)
    const desk = readFileSync(join(here, '../components/TelegramDeskCard.tsx'), 'utf8')
    expect(desk).toContain('Connect Telegram')
    expect(desk).toContain('desk-telegram-channel')
  })
})
