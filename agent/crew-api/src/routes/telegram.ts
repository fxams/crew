import { Router } from 'express'
import { z } from 'zod'
import { takeRateLimit } from '../lib/agent/rate-limit.js'
import { requireAgentApiKey } from '../lib/auth.js'
import { clientIp } from '../lib/client-ip.js'
import { sendInternalError } from '../lib/http-error.js'
import { getKolProfileByXUserId } from '../lib/kol-register.js'
import { issueKolSessionToken, kolSessionCookieHeader, readKolSessionCookie } from '../lib/kol-session.js'
import {
  TELEGRAM_BOT_URL,
  TELEGRAM_BOT_USERNAME,
  checkTelegramWebhookSecret,
  sendTelegramDm,
  telegramConfigured,
  verifyTelegramWidget,
} from '../lib/telegram.js'
import {
  agentNotifyHiredCrewTelegram,
  handleTelegramStart,
  handleTelegramStop,
  issueTelegramStartCode,
  jobsHelpText,
  rememberChannelPost,
  startChannelVerify,
  upsertTelegramKol,
  verifyChannelOwnership,
  applyTelegramLink,
} from '../lib/telegram-kol.js'

export const telegramRouter = Router()

const widgetBody = z.object({
  id: z.number().int().positive(),
  first_name: z.string().min(1).max(64),
  last_name: z.string().max(64).optional(),
  username: z.string().max(32).optional(),
  photo_url: z.string().max(500).optional(),
  auth_date: z.number().int(),
  hash: z.string().min(32).max(128),
})

telegramRouter.post('/kols/telegram/login', async (req, res) => {
  try {
    if (!telegramConfigured()) {
      res.status(503).json({ ok: false, error: 'Telegram login is not configured.' })
      return
    }
    const ip = clientIp(req)
    const gate = takeRateLimit(`tg:login:${ip}`, { limit: 20, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfterSec))
      res.status(429).json({ ok: false, error: 'Slow down and retry.' })
      return
    }
    const widget = verifyTelegramWidget(widgetBody.parse(req.body))
    const session = (() => {
      try {
        return readKolSessionCookie(req.headers.cookie)
      } catch {
        return null
      }
    })()
    const referral = String((req.body as { referralCode?: string }).referralCode || '').trim()
    const result = await upsertTelegramKol({
      widget,
      linkXUserId: session?.u,
      referralCode: referral,
    })
    let token: string | null = null
    try {
      token = issueKolSessionToken({ xUserId: result.xUserId, username: result.username })
      res.setHeader('Set-Cookie', kolSessionCookieHeader(token))
    } catch {
      /* session secret missing in some test envs */
    }
    const profile = await getKolProfileByXUserId(result.xUserId).catch(() => null)
    res.json({
      ok: true,
      created: result.created,
      telegramOnly: result.telegramOnly,
      handle: result.username,
      deskPath: `/kol/${result.username}`,
      note: result.telegramOnly
        ? 'Telegram-only desks are ranked lower until verified on X or a verified channel.'
        : 'Telegram linked. X stays primary.',
      profile: profile?.profile || undefined,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Telegram login failed'
    res.status(/Invalid|expired|already linked/i.test(msg) ? 401 : 400).json({ ok: false, error: msg })
  }
})

telegramRouter.post('/kols/telegram/start-code', async (req, res) => {
  try {
    const session = readKolSessionCookie(req.headers.cookie)
    if (!session) {
      res.status(401).json({ ok: false, error: 'Sign in to manage Telegram alerts.' })
      return
    }
    const issued = await issueTelegramStartCode(session.u)
    res.json({ ok: true, ...issued, bot: TELEGRAM_BOT_USERNAME, botUrl: TELEGRAM_BOT_URL })
  } catch (err) {
    sendInternalError(res, err, 'telegram-start-code')
  }
})

telegramRouter.post('/kols/telegram/alerts', async (req, res) => {
  try {
    const session = readKolSessionCookie(req.headers.cookie)
    if (!session) {
      res.status(401).json({ ok: false, error: 'Sign in to manage Telegram alerts.' })
      return
    }
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body)
    await applyTelegramLink(session.u, { telegramAlerts: enabled })
    res.json({
      ok: true,
      telegramAlerts: enabled,
      tip: enabled
        ? `Open ${TELEGRAM_BOT_URL} and tap /start so the bot can DM you.`
        : 'Alerts muted.',
    })
  } catch (err) {
    sendInternalError(res, err, 'telegram-alerts')
  }
})

telegramRouter.post('/kols/telegram/channel/start', async (req, res) => {
  try {
    const session = readKolSessionCookie(req.headers.cookie)
    if (!session) {
      res.status(401).json({ ok: false, error: 'Sign in to verify a channel.' })
      return
    }
    const { channel } = z.object({ channel: z.string().min(2).max(80) }).parse(req.body)
    const out = await startChannelVerify({ xUserId: session.u, channel })
    res.json({
      ok: true,
      ...out,
      bot: TELEGRAM_BOT_USERNAME,
      instructions: `Add @${TELEGRAM_BOT_USERNAME} to ${out.channel}, post ${out.phrase}, then tap Verify.`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'channel start failed'
    res.status(400).json({ ok: false, error: msg })
  }
})

telegramRouter.post('/kols/telegram/channel/verify', async (req, res) => {
  try {
    const session = readKolSessionCookie(req.headers.cookie)
    if (!session) {
      res.status(401).json({ ok: false, error: 'Sign in to verify a channel.' })
      return
    }
    const out = await verifyChannelOwnership(session.u)
    res.json({ ok: true, ...out })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'channel verify failed'
    res.status(400).json({ ok: false, error: msg })
  }
})

telegramRouter.post('/agent/crew/notify-telegram', requireAgentApiKey, async (req, res) => {
  try {
    const ip = clientIp(req)
    const gate = takeRateLimit(`tg:agent-notify:${ip}`, { limit: 20, windowMs: 60_000 })
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfterSec))
      res.status(429).json({ ok: false, error: 'Slow down and retry.' })
      return
    }
    const body = z
      .object({
        mint: z.string().min(8).max(64).optional(),
        handles: z.array(z.string().min(1).max(32)).max(20).optional(),
        wallets: z.array(z.string().min(32).max(64)).max(20).optional(),
        message: z.string().max(500).optional(),
      })
      .parse(req.body || {})
    const out = await agentNotifyHiredCrewTelegram(body)
    res.json({
      ok: true,
      ...out,
      disclaimer: 'Opt-in only. The bot DMs KOLs who linked Telegram, /start-ed, and enabled alerts.',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'notify failed'
    res.status(400).json({ ok: false, error: msg })
  }
})

telegramRouter.post('/telegram/webhook', async (req, res) => {
  try {
    if (!checkTelegramWebhookSecret(req.header('x-telegram-bot-api-secret-token'))) {
      res.status(401).json({ ok: false, error: 'Unauthorized.' })
      return
    }
    const update = (req.body || {}) as {
      message?: {
        text?: string
        chat?: { id?: number; type?: string }
        from?: { id?: number; username?: string }
      }
      channel_post?: { text?: string; chat?: { id?: number; username?: string } }
    }
    if (update.channel_post?.text && update.channel_post.chat?.id) {
      await rememberChannelPost({
        text: update.channel_post.text,
        chatId: update.channel_post.chat.id,
        username: update.channel_post.chat.username,
      })
      res.json({ ok: true })
      return
    }
    const text = String(update.message?.text || '').trim()
    const chatId = update.message?.chat?.id
    const fromId = update.message?.from?.id
    if (!chatId || !fromId) {
      res.json({ ok: true })
      return
    }
    const chatType = update.message?.chat?.type
    if (chatType && chatType !== 'private') {
      if (text) {
        await rememberChannelPost({
          text,
          chatId,
          username: update.message?.from?.username,
        })
      }
      res.json({ ok: true })
      return
    }
    let reply = 'CrewPay: /start · /stop · /jobs'
    if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
      const payload = text.replace(/^\/start(?:@\w+)?\s*/i, '').trim()
      reply = await handleTelegramStart({
        telegramUserId: String(fromId),
        chatId: String(chatId),
        username: update.message?.from?.username,
        payload,
      })
    } else if (/^\/stop\b/i.test(text)) {
      reply = await handleTelegramStop(String(fromId))
    } else if (/^\/jobs\b/i.test(text)) {
      reply = jobsHelpText()
    }
    await sendTelegramDm(chatId, reply)
    res.json({ ok: true })
  } catch (err) {
    sendInternalError(res, err, 'telegram-webhook')
  }
})
