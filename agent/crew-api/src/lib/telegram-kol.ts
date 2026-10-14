/**
 * KOL Telegram identity, channel verify, and opt-in alerts.
 * Verified tg_reach is a small capped Autohire boost (see telegram-reach.ts). Fee splits unchanged.
 */

import { randomBytes } from 'node:crypto'
import { query } from './db.js'
import {
  isTelegramOnlyKol,
  normalizeTelegramChannel,
  sendTelegramDm,
  telegramApi,
  telegramDeskHandle,
  telegramGetChat,
  telegramGetChatMemberCount,
  telegramSyntheticXUserId,
  type TelegramInlineKeyboard,
  type TelegramWidgetUser,
} from './telegram.js'
import { normalizeRegisterSrc, TELEGRAM_REGISTER_KOL_URL } from './register-src.js'
import { referralCodeFromUsername } from './kol-register.js'

export { TELEGRAM_REGISTER_KOL_URL }

export function registerKolInlineKeyboard(): TelegramInlineKeyboard {
  return {
    inline_keyboard: [[{ text: 'Register as KOL', url: TELEGRAM_REGISTER_KOL_URL }]],
  }
}

export async function persistRegisterSrc(
  xUserId: string,
  raw: string | null | undefined,
): Promise<void> {
  const src = normalizeRegisterSrc(raw)
  if (!src) return
  const prev = await loadByXUserId(xUserId)
  if (prev?.register_src) return
  if (useDb()) {
    await query(
      `UPDATE kol_registrations
       SET register_src = $2, updated_at = now()
       WHERE x_user_id = $1 AND (register_src IS NULL OR register_src = '')`,
      [xUserId, src],
    )
    return
  }
  const row = memRows.get(xUserId)
  if (row && !row.register_src) row.register_src = src
}
import { isPayoutWallet } from './agent/shareholders.js'

const START_TTL_MS = 30 * 60_000
const CHANNEL_CODE_TTL_MS = 30 * 60_000

type LinkCode = {
  code: string
  xUserId: string
  purpose: 'start' | 'channel'
  channel?: string
  expiresAt: number
}

type SeenChannelPost = { code: string; chatId: string; username?: string; at: number }

const memCodes = new Map<string, LinkCode>()
const memPosts = new Map<string, SeenChannelPost>()
const memRows = new Map<string, Record<string, unknown>>()

function useDb(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

function issueCode(): string {
  return randomBytes(4).toString('hex')
}

export function channelVerifyPhrase(code: string): string {
  return `CREW-${code.trim().toUpperCase()}`
}

export function extractChannelCode(text: string): string | null {
  const m = String(text || '').toUpperCase().match(/\bCREW-([A-F0-9]{6,12})\b/)
  return m?.[1] || null
}

async function persistCode(row: LinkCode): Promise<void> {
  memCodes.set(row.code, row)
  if (!useDb()) return
  await query(
    `INSERT INTO telegram_link_codes (code, x_user_id, purpose, channel, expires_at)
     VALUES ($1,$2,$3,$4, to_timestamp($5/1000.0))
     ON CONFLICT (code) DO UPDATE SET
       x_user_id = EXCLUDED.x_user_id,
       purpose = EXCLUDED.purpose,
       channel = EXCLUDED.channel,
       expires_at = EXCLUDED.expires_at`,
    [row.code, row.xUserId, row.purpose, row.channel || null, row.expiresAt],
  )
}

async function consumeCode(code: string, purpose?: LinkCode['purpose']): Promise<LinkCode | null> {
  const key = code.trim().toLowerCase()
  const mem = memCodes.get(key)
  if (mem) {
    if (mem.expiresAt <= Date.now()) {
      memCodes.delete(key)
    } else if (!purpose || mem.purpose === purpose) {
      memCodes.delete(key)
      if (useDb()) {
        await query(`DELETE FROM telegram_link_codes WHERE lower(code) = $1`, [key]).catch(() => {})
      }
      return mem
    }
  }
  if (!useDb()) return null
  const { rows } = await query<LinkCode & { expires_at: string; x_user_id: string }>(
    `DELETE FROM telegram_link_codes
     WHERE lower(code) = $1 AND expires_at > now()
       AND ($2::text IS NULL OR purpose = $2)
     RETURNING code, x_user_id, purpose, channel, (extract(epoch from expires_at)*1000)::bigint AS expires_at`,
    [key, purpose || null],
  )
  const row = rows[0]
  if (!row) return null
  return {
    code: String(row.code),
    xUserId: String(row.x_user_id),
    purpose: row.purpose,
    channel: row.channel,
    expiresAt: Number(row.expires_at),
  }
}

export async function rememberChannelPost(opts: {
  text: string
  chatId: string | number
  username?: string
}): Promise<boolean> {
  const code = extractChannelCode(opts.text)
  if (!code) return false
  const rec: SeenChannelPost = {
    code,
    chatId: String(opts.chatId),
    username: opts.username,
    at: Date.now(),
  }
  memPosts.set(code, rec)
  if (useDb()) {
    await query(
      `INSERT INTO telegram_channel_posts (code, chat_id, username, seen_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (code) DO UPDATE SET chat_id = EXCLUDED.chat_id, username = EXCLUDED.username, seen_at = now()`,
      [code, rec.chatId, rec.username || null],
    ).catch(() => {})
  }
  return true
}

async function seenPost(code: string): Promise<SeenChannelPost | null> {
  const mem = memPosts.get(code.toUpperCase()) || memPosts.get(code)
  if (mem && Date.now() - mem.at < CHANNEL_CODE_TTL_MS) return mem
  if (!useDb()) return mem || null
  const { rows } = await query<SeenChannelPost & { chat_id: string; seen_at: string }>(
    `SELECT code, chat_id, username, (extract(epoch from seen_at)*1000)::bigint AS at
     FROM telegram_channel_posts WHERE upper(code) = upper($1)`,
    [code],
  )
  const row = rows[0]
  if (!row) return mem || null
  return {
    code: String(row.code),
    chatId: String(row.chat_id),
    username: row.username,
    at: Number(row.at),
  }
}

export type TelegramKolFields = {
  telegramUserId: string | null
  telegramUsername: string | null
  telegramChatId: string | null
  telegramAlerts: boolean
  tgChannel: string | null
  tgChannelId: string | null
  tgChannelVerified: boolean
  tgChannelVerifiedAt: string | null
  tgReach: number | null
}

export function telegramFieldsFromRow(r: Record<string, unknown>): TelegramKolFields {
  return {
    telegramUserId: r.telegram_user_id ? String(r.telegram_user_id) : null,
    telegramUsername: r.telegram_username ? String(r.telegram_username) : null,
    telegramChatId: r.telegram_chat_id ? String(r.telegram_chat_id) : null,
    telegramAlerts: Boolean(r.telegram_alerts),
    tgChannel: r.tg_channel ? String(r.tg_channel) : null,
    tgChannelId: r.tg_channel_id ? String(r.tg_channel_id) : null,
    tgChannelVerified: Boolean(r.tg_channel_verified),
    tgChannelVerifiedAt: r.tg_channel_verified_at
      ? new Date(String(r.tg_channel_verified_at)).toISOString()
      : null,
    tgReach: r.tg_reach != null && Number.isFinite(Number(r.tg_reach)) ? Number(r.tg_reach) : null,
  }
}

async function loadByXUserId(xUserId: string): Promise<Record<string, unknown> | null> {
  if (useDb()) {
    const { rows } = await query(`SELECT * FROM kol_registrations WHERE x_user_id = $1`, [xUserId])
    return (rows[0] as Record<string, unknown>) || null
  }
  return memRows.get(xUserId) || null
}

async function loadByTelegramUserId(tgId: string): Promise<Record<string, unknown> | null> {
  if (useDb()) {
    const { rows } = await query(`SELECT * FROM kol_registrations WHERE telegram_user_id = $1`, [tgId])
    return (rows[0] as Record<string, unknown>) || null
  }
  for (const row of memRows.values()) {
    if (String(row.telegram_user_id || '') === tgId) return row
  }
  return null
}

async function usernameTaken(handle: string, exceptXUserId?: string): Promise<boolean> {
  if (useDb()) {
    const { rows } = await query<{ x_user_id: string }>(
      `SELECT x_user_id FROM kol_registrations WHERE lower(x_username) = lower($1)`,
      [handle],
    )
    return Boolean(rows[0] && rows[0].x_user_id !== exceptXUserId)
  }
  for (const row of memRows.values()) {
    if (String(row.x_username || '').toLowerCase() === handle.toLowerCase()) {
      if (exceptXUserId && String(row.x_user_id) === exceptXUserId) continue
      return true
    }
  }
  return false
}

export async function issueTelegramStartCode(xUserId: string): Promise<{
  code: string
  deepLink: string
  expiresAt: string
}> {
  const id = xUserId.trim()
  if (!id) throw new Error('Sign in first.')
  const code = issueCode()
  const expiresAt = Date.now() + START_TTL_MS
  await persistCode({ code, xUserId: id, purpose: 'start', expiresAt })
  const bot = (process.env.TELEGRAM_BOT_USERNAME || 'CrewPay_Bot').trim().replace(/^@+/, '')
  return {
    code,
    deepLink: `https://t.me/${bot || 'CrewPay_Bot'}?start=${code}`,
    expiresAt: new Date(expiresAt).toISOString(),
  }
}

export async function handleTelegramStart(opts: {
  telegramUserId: string
  chatId: string
  username?: string
  payload?: string
}): Promise<string> {
  const tgId = String(opts.telegramUserId)
  const chatId = String(opts.chatId)
  const payload = (opts.payload || '').trim()
  let row = payload ? null : await loadByTelegramUserId(tgId)
  if (payload) {
    const consumed = await consumeCode(payload, 'start')
    if (consumed) row = await loadByXUserId(consumed.xUserId)
  }
  if (!row && !payload) row = await loadByTelegramUserId(tgId)
  if (!row) {
    return 'CrewPay: open crewpay.dev/register and tap Login with Telegram, then /start again. Or use the link from your Desk.'
  }
  await applyTelegramLink(String(row.x_user_id), {
    telegramUserId: tgId,
    telegramUsername: opts.username || String(row.telegram_username || ''),
    telegramChatId: chatId,
    telegramAlerts: true,
  })
  return 'CrewPay alerts on. You will get a DM when a crew hires you or a job opens. /stop to mute. /jobs for open jobs.'
}

export async function handleTelegramStop(telegramUserId: string): Promise<string> {
  const row = await loadByTelegramUserId(String(telegramUserId))
  if (!row) return 'CrewPay: not linked. Open Desk and Login with Telegram first.'
  await applyTelegramLink(String(row.x_user_id), { telegramAlerts: false })
  return 'CrewPay alerts off. /start to turn them back on.'
}

export async function applyTelegramLink(
  xUserId: string,
  patch: Partial<{
    telegramUserId: string
    telegramUsername: string
    telegramChatId: string
    telegramAlerts: boolean
    tgChannel: string | null
    tgChannelId: string | null
    tgChannelVerified: boolean
    tgReach: number | null
    tgChannelCode: string | null
  }>,
): Promise<void> {
  const prev = (await loadByXUserId(xUserId)) || { x_user_id: xUserId }
  const verifiedAt =
    patch.tgChannelVerified === true
      ? new Date().toISOString()
      : patch.tgChannelVerified === false
        ? null
        : prev.tg_channel_verified_at
  const next = {
    ...prev,
    telegram_user_id: patch.telegramUserId ?? prev.telegram_user_id,
    telegram_username: patch.telegramUsername ?? prev.telegram_username,
    telegram_chat_id: patch.telegramChatId ?? prev.telegram_chat_id,
    telegram_alerts:
      patch.telegramAlerts === undefined ? prev.telegram_alerts : patch.telegramAlerts,
    tg_channel: patch.tgChannel === undefined ? prev.tg_channel : patch.tgChannel,
    tg_channel_id: patch.tgChannelId === undefined ? prev.tg_channel_id : patch.tgChannelId,
    tg_channel_verified:
      patch.tgChannelVerified === undefined ? prev.tg_channel_verified : patch.tgChannelVerified,
    tg_channel_verified_at: verifiedAt,
    tg_reach: patch.tgReach === undefined ? prev.tg_reach : patch.tgReach,
    tg_channel_code:
      patch.tgChannelCode === undefined ? prev.tg_channel_code : patch.tgChannelCode,
    updated_at: new Date().toISOString(),
  }
  memRows.set(xUserId, next)
  if (!useDb()) return
  await query(
    `UPDATE kol_registrations SET
       telegram_user_id = COALESCE($2, telegram_user_id),
       telegram_username = COALESCE($3, telegram_username),
       telegram_chat_id = COALESCE($4, telegram_chat_id),
       telegram_alerts = COALESCE($5, telegram_alerts),
       tg_channel = COALESCE($6, tg_channel),
       tg_channel_id = COALESCE($7, tg_channel_id),
       tg_channel_verified = COALESCE($8, tg_channel_verified),
       tg_channel_verified_at = CASE
         WHEN $8::boolean IS TRUE THEN now()
         WHEN $8::boolean IS FALSE THEN NULL
         ELSE tg_channel_verified_at
       END,
       tg_reach = COALESCE($9, tg_reach),
       tg_channel_code = COALESCE($10, tg_channel_code),
       updated_at = now()
     WHERE x_user_id = $1`,
    [
      xUserId,
      patch.telegramUserId ?? null,
      patch.telegramUsername ?? null,
      patch.telegramChatId ?? null,
      patch.telegramAlerts === undefined ? null : patch.telegramAlerts,
      patch.tgChannel === undefined ? null : patch.tgChannel,
      patch.tgChannelId === undefined ? null : patch.tgChannelId,
      patch.tgChannelVerified === undefined ? null : patch.tgChannelVerified,
      patch.tgReach === undefined ? null : patch.tgReach,
      patch.tgChannelCode === undefined ? null : patch.tgChannelCode,
    ],
  )
}

export async function upsertTelegramKol(opts: {
  widget: TelegramWidgetUser
  linkXUserId?: string
  referralCode?: string
  registerSrc?: string
}): Promise<{
  xUserId: string
  username: string
  created: boolean
  telegramOnly: boolean
}> {
  const tgId = String(opts.widget.id)
  const existingTg = await loadByTelegramUserId(tgId)
  if (opts.linkXUserId) {
    if (existingTg && String(existingTg.x_user_id) !== opts.linkXUserId) {
      throw new Error('That Telegram account is already linked to another desk.')
    }
    await applyTelegramLink(opts.linkXUserId, {
      telegramUserId: tgId,
      telegramUsername: opts.widget.username || '',
    })
    await persistRegisterSrc(opts.linkXUserId, opts.registerSrc)
    const linked = await loadByXUserId(opts.linkXUserId)
    return {
      xUserId: opts.linkXUserId,
      username: String(linked?.x_username || opts.widget.username || telegramDeskHandle(undefined, tgId)),
      created: false,
      telegramOnly: isTelegramOnlyKol(opts.linkXUserId),
    }
  }
  if (existingTg) {
    await applyTelegramLink(String(existingTg.x_user_id), {
      telegramUserId: tgId,
      telegramUsername: opts.widget.username || String(existingTg.telegram_username || ''),
    })
    await persistRegisterSrc(String(existingTg.x_user_id), opts.registerSrc)
    return {
      xUserId: String(existingTg.x_user_id),
      username: String(existingTg.x_username),
      created: false,
      telegramOnly: isTelegramOnlyKol(String(existingTg.x_user_id)),
    }
  }

  const xUserId = telegramSyntheticXUserId(tgId)
  let handle = telegramDeskHandle(opts.widget.username, tgId)
  if (await usernameTaken(handle)) handle = telegramDeskHandle(undefined, tgId)
  const name = [opts.widget.first_name, opts.widget.last_name].filter(Boolean).join(' ').trim() || handle
  const referredBy = (opts.referralCode || '').trim().toLowerCase() || null
  const registerSrc = normalizeRegisterSrc(opts.registerSrc)
  const row = {
    x_user_id: xUserId,
    x_username: handle,
    x_name: name,
    x_verified: false,
    followers: 0,
    telegram_user_id: tgId,
    telegram_username: opts.widget.username || '',
    telegram_alerts: false,
    referral_code: referralCodeFromUsername(handle),
    referred_by_code: referredBy,
    register_src: registerSrc,
    wallet: '',
    registered_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  memRows.set(xUserId, row)
  if (useDb()) {
    await query(
      `INSERT INTO kol_registrations (
         x_user_id, x_username, x_name, x_verified, followers, wallet,
         referral_code, referred_by_code, telegram_user_id, telegram_username,
         register_ip, register_src
       ) VALUES ($1,$2,$3,false,0,'',$4,$5,$6,$7,null,$8)
       ON CONFLICT (x_user_id) DO UPDATE SET
         telegram_user_id = EXCLUDED.telegram_user_id,
         telegram_username = EXCLUDED.telegram_username,
         register_src = COALESCE(kol_registrations.register_src, EXCLUDED.register_src),
         updated_at = now()`,
      [
        xUserId,
        handle,
        name,
        row.referral_code,
        referredBy,
        tgId,
        opts.widget.username || '',
        registerSrc,
      ],
    )
  }
  return { xUserId, username: handle, created: true, telegramOnly: true }
}

export async function startChannelVerify(opts: {
  xUserId: string
  channel: string
}): Promise<{ code: string; phrase: string; expiresAt: string; channel: string }> {
  const channel = normalizeTelegramChannel(opts.channel)
  if (!channel) throw new Error('Enter a Telegram channel or group (@name).')
  const code = issueCode().toUpperCase()
  const expiresAt = Date.now() + CHANNEL_CODE_TTL_MS
  await persistCode({
    code: code.toLowerCase(),
    xUserId: opts.xUserId,
    purpose: 'channel',
    channel,
    expiresAt,
  })
  await applyTelegramLink(opts.xUserId, {
    tgChannel: channel,
    tgChannelVerified: false,
    tgChannelCode: code,
  })
  return {
    code,
    phrase: channelVerifyPhrase(code),
    expiresAt: new Date(expiresAt).toISOString(),
    channel,
  }
}

export async function verifyChannelOwnership(xUserId: string): Promise<{
  verified: boolean
  channel: string | null
  tgReach: number | null
  note: string
}> {
  const row = await loadByXUserId(xUserId)
  if (!row) throw new Error('Sign in first.')
  const channel = normalizeTelegramChannel(String(row.tg_channel || ''))
  const code = String(row.tg_channel_code || '')
  if (!channel || !code) throw new Error('Start channel verification first.')

  const posted = await seenPost(code)
  const chat = await telegramGetChat(posted?.chatId || channel)
  const reach = chat ? await telegramGetChatMemberCount(chat.id) : await telegramGetChatMemberCount(channel)

  if (posted) {
    await applyTelegramLink(xUserId, {
      tgChannel: channel,
      tgChannelId: String(chat?.id || posted.chatId),
      tgChannelVerified: true,
      tgReach: reach,
    })
    return {
      verified: true,
      channel,
      tgReach: reach,
      note: 'Channel verified via the posted code. Fresh member count is a small capped Autohire boost (≤10% of score). Fee splits unchanged.',
    }
  }

  if (chat) {
    try {
      await telegramApi('getChatMember', {
        chat_id: chat.id,
        user_id: Number(String(row.telegram_user_id || '0')),
      })
    } catch {
      /* public fallback still stores reach */
    }
    await applyTelegramLink(xUserId, {
      tgChannel: channel,
      tgChannelId: String(chat.id),
      tgChannelVerified: false,
      tgReach: reach,
    })
    return {
      verified: false,
      channel,
      tgReach: reach,
      note: 'Public channel found. Add @CrewPay_Bot and post the code so we can verify ownership. Unverified member count does not change rank.',
    }
  }

  throw new Error('Could not see that channel. Add @CrewPay_Bot or make the channel public, then retry.')
}

export type TelegramAlertTarget = {
  handle: string
  chatId: string
  wallet?: string
}

export async function listAlertTargets(opts?: {
  handles?: string[]
  wallets?: string[]
}): Promise<TelegramAlertTarget[]> {
  const handles = (opts?.handles || []).map((h) => h.replace(/^@+/, '').toLowerCase()).filter(Boolean)
  const wallets = (opts?.wallets || []).filter((w) => isPayoutWallet(w))
  if (useDb()) {
    const { rows } = await query<{
      x_username: string
      telegram_chat_id: string
      wallet: string
    }>(
      `SELECT x_username, telegram_chat_id, wallet FROM kol_registrations
       WHERE telegram_alerts = true
         AND telegram_chat_id IS NOT NULL AND telegram_chat_id <> ''
         AND (
           $1::int = 0 OR lower(x_username) = ANY ($2::text[])
           OR ($3::int > 0 AND wallet = ANY ($4::text[]))
         )`,
      [handles.length, handles, wallets.length, wallets],
    )
    return rows.map((r) => ({
      handle: String(r.x_username),
      chatId: String(r.telegram_chat_id),
      wallet: r.wallet,
    }))
  }
  const out: TelegramAlertTarget[] = []
  for (const row of memRows.values()) {
    if (!row.telegram_alerts || !row.telegram_chat_id) continue
    const handle = String(row.x_username || '')
    const wallet = String(row.wallet || '')
    const matchHandle = !handles.length || handles.includes(handle.toLowerCase())
    const matchWallet = !wallets.length || wallets.includes(wallet)
    if ((handles.length || wallets.length) && !matchHandle && !matchWallet) continue
    out.push({ handle, chatId: String(row.telegram_chat_id), wallet })
  }
  return out
}

export async function notifyTelegramTargets(
  targets: TelegramAlertTarget[],
  text: string,
): Promise<{ sent: number; skipped: number }> {
  let sent = 0
  let skipped = 0
  for (const t of targets.slice(0, 40)) {
    const ok = await sendTelegramDm(t.chatId, text)
    if (ok) sent += 1
    else skipped += 1
  }
  return { sent, skipped }
}

export async function notifyHiredCrewTelegram(opts: {
  mint: string
  ticker?: string
  crew: Array<{ handle?: string; wallet?: string }>
}): Promise<{ sent: number; skipped: number }> {
  const handles = opts.crew.map((c) => c.handle || '').filter(Boolean)
  const wallets = opts.crew.map((c) => c.wallet || '').filter(Boolean)
  const targets = await listAlertTargets({ handles, wallets })
  if (!targets.length) return { sent: 0, skipped: 0 }
  const ticker = (opts.ticker || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 13)
  const text = [
    `CrewPay: you were hired${ticker ? ` on $${ticker}` : ''}.`,
    `Coin: https://crewpay.dev/coin/${opts.mint}`,
    'Alerts are opt-in. /stop to mute.',
  ].join('\n')
  return notifyTelegramTargets(targets, text)
}

export async function notifyJobOpenTelegram(opts: {
  mint: string
  jobId: string
  template?: string
  crew?: Array<{ handle?: string; wallet?: string }>
}): Promise<{ sent: number; skipped: number }> {
  const handles = (opts.crew || []).map((c) => c.handle || '').filter(Boolean)
  const wallets = (opts.crew || []).map((c) => c.wallet || '').filter(Boolean)
  const targets = await listAlertTargets(
    handles.length || wallets.length ? { handles, wallets } : undefined,
  )
  if (!targets.length) return { sent: 0, skipped: 0 }
  const text = [
    `CrewPay: a job opened${opts.template ? ` (${opts.template})` : ''}.`,
    `Page: https://crewpay.dev/coin/${opts.mint}`,
    'Claim from the coin page. /stop to mute.',
  ].join('\n')
  return notifyTelegramTargets(targets, text)
}

export async function agentNotifyHiredCrewTelegram(opts: {
  mint?: string
  handles?: string[]
  wallets?: string[]
  message?: string
}): Promise<{ sent: number; skipped: Array<{ handle: string; reason: string }> }> {
  const handles = opts.handles || []
  const wallets = opts.wallets || []
  if (!opts.mint && !handles.length && !wallets.length) {
    throw new Error('Pass mint and/or handles of hired crew.')
  }
  let crewHandles = handles
  let crewWallets = wallets
  if (opts.mint && !handles.length && !wallets.length) {
    try {
      const { getCoin } = await import('./coins.js')
      const coin = await getCoin(opts.mint)
      crewHandles = (coin?.crew || []).map((m) => m.handle)
      crewWallets = (coin?.crew || []).map((m) => m.wallet)
    } catch {
      /* mint may be unknown in tests */
    }
  }
  const targets = await listAlertTargets({ handles: crewHandles, wallets: crewWallets })
  const custom = (opts.message || '').trim().slice(0, 500)
  const text = [
    custom || 'CrewPay: an agent is notifying hired crew (opt-in Telegram).',
    opts.mint ? `Coin: https://crewpay.dev/coin/${opts.mint}` : '',
    '/stop to mute.',
  ]
    .filter(Boolean)
    .join('\n')
  const result = await notifyTelegramTargets(targets, text)
  const skipped = crewHandles
    .map((h) => h.replace(/^@+/, ''))
    .filter((h) => h && !targets.some((t) => t.handle.toLowerCase() === h.toLowerCase()))
    .map((handle) => ({ handle, reason: 'no_telegram_opt_in' }))
  return { sent: result.sent, skipped }
}

export function jobsHelpText(): string {
  return 'Open jobs: https://crewpay.dev/coins — claim from a coin page when JOBS_ENABLED. /start alerts, /stop mute.'
}
