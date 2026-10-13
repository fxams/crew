import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  agentNotifyHiredCrewTelegram,
  applyTelegramLink,
  channelVerifyPhrase,
  extractChannelCode,
  handleTelegramStart,
  handleTelegramStop,
  issueTelegramStartCode,
  listAlertTargets,
  rememberChannelPost,
  startChannelVerify,
  telegramFieldsFromRow,
  upsertTelegramKol,
  verifyChannelOwnership,
} from './telegram-kol.js'

const widget = {
  id: 777,
  first_name: 'Ada',
  username: 'ada_tg',
  auth_date: Math.floor(Date.now() / 1000),
  hash: 'ab'.repeat(32),
}

describe('Telegram KOL link + alerts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.DATABASE_URL
  })

  it('creates a TG-only desk and ranks that path as telegram-only', async () => {
    const created = await upsertTelegramKol({ widget })
    expect(created.created).toBe(true)
    expect(created.telegramOnly).toBe(true)
    expect(created.xUserId).toBe('tg:777')
    expect(created.username).toBe('ada_tg')
  })

  it('links /start via one-time code and honors /stop', async () => {
    const created = await upsertTelegramKol({ widget: { ...widget, id: 778, username: 'bob_tg' } })
    const issued = await issueTelegramStartCode(created.xUserId)
    expect(issued.deepLink).toContain('start=')
    const start = await handleTelegramStart({
      telegramUserId: '778',
      chatId: '778',
      username: 'bob_tg',
      payload: issued.code,
    })
    expect(start).toMatch(/alerts on/i)
    const targets = await listAlertTargets({ handles: ['bob_tg'] })
    expect(targets[0]?.chatId).toBe('778')
    await handleTelegramStop('778')
    expect(await listAlertTargets({ handles: ['bob_tg'] })).toEqual([])
  })

  it('extracts a channel code and only marks verified after the post is seen', async () => {
    expect(extractChannelCode('please post CREW-AB12CD34 here')).toBe('AB12CD34')
    expect(channelVerifyPhrase('ab12cd34')).toBe('CREW-AB12CD34')
    const created = await upsertTelegramKol({ widget: { ...widget, id: 779, username: 'cara' } })
    const started = await startChannelVerify({ xUserId: created.xUserId, channel: 'https://t.me/caraHQ' })
    expect(started.channel).toBe('@caraHQ')
    expect(started.phrase).toMatch(/^CREW-/)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: false, description: 'chat not found' }), { status: 200 })),
    )
    await expect(verifyChannelOwnership(created.xUserId)).rejects.toThrow(/Could not see/)
    await rememberChannelPost({
      text: `verify ${started.phrase}`,
      chatId: '-10099',
      username: 'caraHQ',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { id: -10099, username: 'caraHQ' } }), { status: 200 })),
    )
    process.env.TELEGRAM_BOT_TOKEN = '123:test'
    const verified = await verifyChannelOwnership(created.xUserId)
    expect(verified.verified).toBe(true)
    expect(verified.note).toMatch(/capped Autohire boost/i)
    delete process.env.TELEGRAM_BOT_TOKEN
  })

  it('agent notify skips KOLs who have not opted in or /start-ed', async () => {
    const created = await upsertTelegramKol({ widget: { ...widget, id: 780, username: 'dana' } })
    await applyTelegramLink(created.xUserId, { telegramAlerts: true })
    const out = await agentNotifyHiredCrewTelegram({ handles: ['dana', 'ghost'] })
    expect(out.sent).toBe(0)
    expect(out.skipped.some((s) => s.reason === 'no_telegram_opt_in')).toBe(true)
  })

  it('maps tg_reach without implying verification', () => {
    const fields = telegramFieldsFromRow({
      telegram_user_id: '1',
      tg_reach: 999999,
      tg_channel_verified: false,
      telegram_alerts: false,
    })
    expect(fields.tgReach).toBe(999999)
    expect(fields.tgChannelVerified).toBe(false)
    expect(fields.tgChannelVerifiedAt).toBeNull()
  })
})
