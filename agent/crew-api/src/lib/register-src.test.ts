import { describe, expect, it } from 'vitest'
import { normalizeRegisterSrc, TELEGRAM_REGISTER_KOL_URL } from './register-src.js'

describe('register-src', () => {
  it('normalizes attribution tags', () => {
    expect(normalizeRegisterSrc('tg_bot')).toBe('tg_bot')
    expect(normalizeRegisterSrc(' TG-Bot ')).toBe('tgbot')
    expect(normalizeRegisterSrc('x')).toBeNull()
  })

  it('uses the bot register URL with src and tg=1', () => {
    expect(TELEGRAM_REGISTER_KOL_URL).toBe('https://crewpay.dev/register?src=tg_bot&tg=1')
  })
})
