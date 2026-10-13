import { describe, expect, it } from 'vitest'
import { TELEGRAM_BOT_USERNAME, isTelegramWidgetAuth } from './telegram-login'

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
})
