import { createHash, createHmac } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  TELEGRAM_BOT_USERNAME,
  checkTelegramWebhookSecret,
  isTelegramOnlyKol,
  normalizeTelegramChannel,
  redactTelegramSecret,
  telegramBotId,
  telegramDeskHandle,
  telegramSyntheticXUserId,
  telegramWidgetCheckString,
  verifyTelegramLoginHash,
  verifyTelegramWidget,
} from './telegram.js'

const TOKEN = '123456:TEST-telegram-bot-token'

function signWidget(fields: {
  id: number
  first_name: string
  last_name?: string
  username?: string
  auth_date: number
}) {
  const check = telegramWidgetCheckString(fields)
  const secret = createHash('sha256').update(TOKEN).digest()
  const hash = createHmac('sha256', secret).update(check).digest('hex')
  return { ...fields, hash }
}

describe('Telegram login widget HMAC', () => {
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_WEBHOOK_SECRET
  })

  it('accepts a matching widget payload and rejects a tampered one', () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN
    const authDate = Math.floor(Date.now() / 1000)
    const ok = signWidget({
      id: 4242,
      first_name: 'Ada',
      username: 'ada_crew',
      auth_date: authDate,
    })
    expect(verifyTelegramLoginHash(ok, TOKEN)).toBe(true)
    expect(verifyTelegramWidget(ok, { token: TOKEN }).username).toBe('ada_crew')
    expect(verifyTelegramLoginHash({ ...ok, first_name: 'Eve' }, TOKEN)).toBe(false)
    expect(() => verifyTelegramWidget({ ...ok, first_name: 'Eve' }, { token: TOKEN })).toThrow(
      /Invalid Telegram login/,
    )
  })

  it('rejects an expired auth_date', () => {
    const ok = signWidget({
      id: 1,
      first_name: 'Old',
      auth_date: Math.floor(Date.now() / 1000) - 48 * 60 * 60,
    })
    expect(() => verifyTelegramWidget(ok, { token: TOKEN })).toThrow(/expired/i)
  })

  it('exposes only the public numeric bot id from the token prefix', () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN
    expect(telegramBotId()).toBe(123456)
    expect(JSON.stringify({ botId: telegramBotId() })).not.toContain('TEST-telegram')
  })

  it('never echoes the bot token from error text', () => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN
    expect(redactTelegramSecret(`failed bot${TOKEN}xyz`)).not.toContain(TOKEN)
    expect(redactTelegramSecret(`failed bot${TOKEN}xyz`)).toContain('[redacted]')
  })

  it('requires the webhook secret header', () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'hook-secret-value'
    expect(checkTelegramWebhookSecret('hook-secret-value')).toBe(true)
    expect(checkTelegramWebhookSecret('nope')).toBe(false)
    expect(checkTelegramWebhookSecret(undefined)).toBe(false)
  })

  it('normalizes public channels and desk handles', () => {
    expect(normalizeTelegramChannel('https://t.me/CrewPayHQ')).toBe('@CrewPayHQ')
    expect(normalizeTelegramChannel('@mychannel')).toBe('@mychannel')
    expect(normalizeTelegramChannel('bad space')).toBe('')
    expect(telegramDeskHandle('alice', 99)).toBe('alice')
    expect(telegramDeskHandle('verylongtelegramname', 123456789012)).toBe('tg_123456789012')
    expect(isTelegramOnlyKol('tg:99')).toBe(true)
    expect(isTelegramOnlyKol('x-user-1')).toBe(false)
    expect(telegramSyntheticXUserId(99)).toBe('tg:99')
    expect(TELEGRAM_BOT_USERNAME).toBeTruthy()
  })
})
