import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireApiKey } from '../lib/auth.js'
import { clientIp } from '../lib/client-ip.js'
import { takeRateLimit } from '../lib/agent/rate-limit.js'
import { sendInternalError } from '../lib/http-error.js'
import { readKolSessionCookie } from '../lib/kol-session.js'
import { kolProgramEnabled } from '../lib/kol-program/flags.js'
import { REACH_FORMULA_DOC } from '../lib/kol-program/reach-score.js'
import {
  cardSvgForHandle,
  creditProgramPoints,
  getCurrentSeasonId,
  getProgramProfileByHandle,
  leaderboard,
  listSeasons,
  loadUserAccessToken,
  seasonArchiveLeaderboard,
} from '../lib/kol-program/store.js'
import { query } from '../lib/db.js'
import { fetchRecentUserTweets } from '../lib/kol-program/x-tweets.js'
import { verifyTaskFromTweets } from '../lib/kol-program/task-verify.js'
import { siteUrl } from '../lib/kol-register.js'
import { KOL_POOL_BPS, CREWPAY_HQ_X_HANDLE } from '../lib/kol-program/flags.js'
import { currentSeasonPoolStatus, seasonBounds } from '../lib/kol-program/treasury-pool.js'
import { buildPoolManifest, eligiblePoolKols } from '../lib/kol-program/pool-allocations.js'
import { buildUnsignedPoolPayouts } from '../lib/kol-program/pool-unsigned.js'
import {
  hofBadgesForHandle,
  hofBadgeLabel,
  listHallOfFameAll,
  listHallOfFameBySeason,
  shoutoutForSeason,
} from '../lib/kol-program/hall-of-fame.js'

export const kolProgramRouter = Router()

function programGate(_req: Request, res: Response, next: NextFunction) {
  if (!kolProgramEnabled()) {
    res.status(404).json({ ok: false, error: 'KOL program is not enabled.' })
    return
  }
  next()
}

kolProgramRouter.use(programGate)

kolProgramRouter.get('/kol-program/status', (_req, res) => {
  res.json({
    ok: true,
    enabled: true,
    pointsDisclaimer:
      'Program points have no monetary value. No token, airdrop, or cash redemption.',
    referralFeeMap:
      'When an agent key is bound with your referral code, launches use 60% crew / 15% agent / 5% referrer / 20% treasury. Non-referred launches stay 60/15/25. No earnings promises.',
    linkPattern: `${siteUrl()}/ref/<handle>`,
    reachFormula: REACH_FORMULA_DOC,
    env: ['KOL_PROGRAM_ENABLED', 'X_CLIENT_ID', 'X_CLIENT_SECRET', 'X_REDIRECT_URI'],
  })
})

kolProgramRouter.get('/kol-program/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query.limit || 50))
    const rows = await leaderboard(limit)
    const seasonId = await getCurrentSeasonId()
    const pool = await currentSeasonPoolStatus(seasonId)
    res.json({
      ok: true,
      seasonId,
      rows,
      disclaimer: 'Points have no monetary value.',
      crewPriorityCopy: 'Top KOLs by season points get first crew slots on new launches (when eligible).',
      pool: {
        poolBps: pool.poolBps,
        receipts: pool.receipts,
        poolSlice: pool.poolSlice,
        copy: pool.copy,
        disclaimer: pool.disclaimer,
      },
    })
  } catch (err) {
    sendInternalError(res, err, 'kol-program leaderboard')
  }
})

kolProgramRouter.get('/kol-program/pool', async (_req, res) => {
  try {
    const seasonId = await getCurrentSeasonId()
    const pool = await currentSeasonPoolStatus(seasonId)
    res.json({ ok: true, ...pool })
  } catch (err) {
    sendInternalError(res, err, 'kol-program pool')
  }
})

kolProgramRouter.get('/kol-program/hall-of-fame', async (req, res) => {
  try {
    const seasonId =
      typeof req.query.seasonId === 'string' && req.query.seasonId.trim()
        ? req.query.seasonId.trim()
        : null
    if (seasonId) {
      const top = await listHallOfFameBySeason(seasonId)
      res.json({ ok: true, seasonId, top })
      return
    }
    const seasons = await listHallOfFameAll()
    res.json({ ok: true, seasons })
  } catch (err) {
    sendInternalError(res, err, 'kol-program hall-of-fame')
  }
})

kolProgramRouter.get('/kol-program/seasons', async (req, res) => {
  try {
    const seasons = await listSeasons()
    const seasonId =
      typeof req.query.seasonId === 'string' && req.query.seasonId.trim()
        ? req.query.seasonId.trim()
        : null
    let archive: Awaited<ReturnType<typeof seasonArchiveLeaderboard>> | null = null
    if (seasonId) {
      archive = await seasonArchiveLeaderboard(seasonId, 100)
    }
    const hallOfFame = seasonId ? await listHallOfFameBySeason(seasonId) : null
    res.json({ ok: true, seasons, archiveSeasonId: seasonId, archive, hallOfFame })
  } catch (err) {
    sendInternalError(res, err, 'kol-program seasons')
  }
})

kolProgramRouter.get('/kol-program/profile/:handle', async (req, res) => {
  try {
    const profile = await getProgramProfileByHandle(req.params.handle)
    if (!profile) {
      res.status(404).json({ ok: false, error: 'KOL not enrolled in program.' })
      return
    }
    res.json({ ok: true, profile })
  } catch (err) {
    sendInternalError(res, err, 'kol-program profile')
  }
})

kolProgramRouter.get('/kol-program/card/:handle.svg', async (req, res) => {
  try {
    const svg = await cardSvgForHandle(req.params.handle)
    if (!svg) {
      res.status(404).send('Not found')
      return
    }
    res.setHeader('content-type', 'image/svg+xml')
    res.setHeader('cache-control', 'public, max-age=300')
    res.send(svg)
  } catch (err) {
    sendInternalError(res, err, 'kol-program card')
  }
})

kolProgramRouter.get('/kol-program/card/:handle.png', async (req, res) => {
  try {
    const svg = await cardSvgForHandle(req.params.handle)
    if (!svg) {
      res.status(404).send('Not found')
      return
    }
    res.setHeader('content-type', 'image/svg+xml')
    res.setHeader('cache-control', 'public, max-age=300')
    res.send(svg)
  } catch (err) {
    sendInternalError(res, err, 'kol-program card png alias')
  }
})

function sessionUser(req: Request): { xUserId: string; handle: string } | null {
  const session = readKolSessionCookie(req.headers.cookie)
  if (!session) return null
  return { xUserId: session.u, handle: session.h }
}

kolProgramRouter.get('/kol-program/me', async (req, res) => {
  try {
    const sess = sessionUser(req)
    if (!sess) {
      res.status(401).json({ ok: false, error: 'KOL session required — complete X sign-in.' })
      return
    }
    const profile = await getProgramProfileByHandle(sess.handle)
    if (!profile) {
      res.status(404).json({ ok: false, error: 'Not enrolled yet.' })
      return
    }
    res.json({ ok: true, profile })
  } catch (err) {
    sendInternalError(res, err, 'kol-program me')
  }
})

kolProgramRouter.get('/kol-program/tasks/today', async (req, res) => {
  try {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, slug, title, instructions, task_type, points
       FROM kol_program_task_templates WHERE active = true ORDER BY sort_order ASC`,
    )
    const day = new Date().toISOString().slice(0, 10)
    const sess = sessionUser(req)
    let completed: string[] = []
    if (sess) {
      const done = await query<{ task_id: string }>(
        `SELECT task_id FROM kol_program_task_completions WHERE x_user_id = $1 AND day_utc = $2::date`,
        [sess.xUserId, day],
      )
      completed = done.rows.map((r) => r.task_id)
    }
    const pick = rows.length ? [rows[day.charCodeAt(9) % rows.length]] : []
    res.json({
      ok: true,
      dayUtc: day,
      tasks: pick.map((t) => ({
        id: String(t.id),
        slug: String(t.slug),
        title: String(t.title),
        instructions: String(t.instructions),
        points: Number(t.points),
        completed: completed.includes(String(t.id)),
      })),
      disclaimer: 'Points have no monetary value.',
    })
  } catch (err) {
    sendInternalError(res, err, 'kol-program tasks')
  }
})

kolProgramRouter.post('/kol-program/tasks/:taskId/verify', async (req, res) => {
  try {
    const ip = clientIp(req)
    const gate = takeRateLimit(`kolprog:verify:${ip}`, { limit: 20, windowMs: 60_000 })
    if (!gate.ok) {
      res.status(429).json({ ok: false, error: 'Slow down and retry.' })
      return
    }
    const sess = sessionUser(req)
    if (!sess) {
      res.status(401).json({ ok: false, error: 'KOL session required.' })
      return
    }
    const profile = await getProgramProfileByHandle(sess.handle)
    if (!profile || profile.revoked) {
      res.status(403).json({ ok: false, error: 'Program access revoked or missing.' })
      return
    }
    if (profile.flaggedReason) {
      res.status(403).json({ ok: false, error: profile.flaggedReason, flagged: true })
      return
    }
    const taskId = req.params.taskId
    const { rows: tasks } = await query<Record<string, unknown>>(
      `SELECT id, slug, task_type, config, points FROM kol_program_task_templates WHERE id = $1 AND active`,
      [taskId],
    )
    const task = tasks[0]
    if (!task) {
      res.status(404).json({ ok: false, error: 'Unknown task.' })
      return
    }
    const day = new Date().toISOString().slice(0, 10)
    const dup = await query(
      `SELECT id FROM kol_program_task_completions WHERE x_user_id = $1 AND task_id = $2 AND day_utc = $3::date`,
      [sess.xUserId, taskId, day],
    )
    if (dup.rows.length) {
      res.json({ ok: true, already: true, points: 0 })
      return
    }
    const token = await loadUserAccessToken(sess.xUserId)
    if (!token) {
      res.status(401).json({
        ok: false,
        error: 'X session expired — sign in with X again from /register to verify tasks.',
      })
      return
    }
    const tweets = await fetchRecentUserTweets(token, sess.xUserId)
    const verdict = verifyTaskFromTweets(
      {
        id: String(task.id),
        slug: String(task.slug),
        task_type: String(task.task_type),
        config: (task.config as Record<string, unknown>) || {},
      },
      tweets,
      { handle: sess.handle, referralUrl: profile.referralUrl },
    )
    if (!verdict.ok) {
      res.status(400).json({ ok: false, error: verdict.reason })
      return
    }
    const points = Number(task.points)
    await query(
      `INSERT INTO kol_program_task_completions (id, x_user_id, task_id, day_utc, points, tweet_id)
       VALUES ($1,$2,$3,$4::date,$5,$6)`,
      [`kptc_${Date.now()}`, sess.xUserId, taskId, day, points, verdict.tweetId],
    )
    await creditProgramPoints(sess.xUserId, points, `task:${task.slug}`, verdict.tweetId)
    res.json({ ok: true, points, tweetId: verdict.tweetId })
  } catch (err) {
    sendInternalError(res, err, 'kol-program verify')
  }
})

const taskBody = z.object({
  title: z.string().min(1).max(120),
  instructions: z.string().max(500).optional(),
  points: z.number().int().min(1).max(100).optional(),
  active: z.boolean().optional(),
})

kolProgramRouter.get('/kol-program/admin/tasks', requireApiKey, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM kol_program_task_templates ORDER BY sort_order`)
    res.json({ ok: true, tasks: rows })
  } catch (err) {
    sendInternalError(res, err, 'kol-program admin tasks')
  }
})

kolProgramRouter.put('/kol-program/admin/tasks/:id', requireApiKey, async (req, res) => {
  try {
    const body = taskBody.parse(req.body)
    await query(
      `UPDATE kol_program_task_templates
       SET title = COALESCE($2, title),
           instructions = COALESCE($3, instructions),
           points = COALESCE($4, points),
           active = COALESCE($5, active),
           updated_at = now()
       WHERE id = $1`,
      [req.params.id, body.title, body.instructions ?? null, body.points ?? null, body.active ?? null],
    )
    res.json({ ok: true })
  } catch (err) {
    sendInternalError(res, err, 'kol-program admin task update')
  }
})

kolProgramRouter.get('/kol-program/admin/flagged', requireApiKey, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT x_user_id, x_username, flagged_reason, revoked, enrolled_at
       FROM kol_program_profiles WHERE flagged_reason IS NOT NULL OR revoked = true
       ORDER BY updated_at DESC LIMIT 200`,
    )
    res.json({ ok: true, rows })
  } catch (err) {
    sendInternalError(res, err, 'kol-program admin flagged')
  }
})

kolProgramRouter.post('/kol-program/admin/pool/manifest/:seasonId', requireApiKey, async (req, res) => {
  try {
    const seasonId = String(req.params.seasonId)
    const bounds = await seasonBounds(seasonId)
    if (!bounds) {
      res.status(404).json({ ok: false, error: 'Unknown season.' })
      return
    }
    const pool = await currentSeasonPoolStatus(seasonId)
    const kols = await eligiblePoolKols(seasonId)
    const manifest = buildPoolManifest({
      seasonId,
      poolBps: KOL_POOL_BPS,
      receipts: pool.receipts,
      kols,
    })
    const unsigned = await buildUnsignedPoolPayouts(manifest.allocations)
    const full = { ...manifest, unsigned }
    await query(
      `INSERT INTO kol_program_pool_manifests (season_id, status, manifest, updated_at)
       VALUES ($1, 'draft', $2::jsonb, now())
       ON CONFLICT (season_id) DO UPDATE SET manifest = EXCLUDED.manifest, updated_at = now()`,
      [seasonId, JSON.stringify(full)],
    )
    res.json({ ok: true, manifest: full })
  } catch (err) {
    sendInternalError(res, err, 'kol-program pool manifest')
  }
})

kolProgramRouter.get('/kol-program/admin/pool/manifest/:seasonId', requireApiKey, async (req, res) => {
  try {
    const seasonId = String(req.params.seasonId)
    const { rows } = await query<{ manifest: unknown }>(
      `SELECT manifest FROM kol_program_pool_manifests WHERE season_id = $1`,
      [seasonId],
    )
    if (!rows[0]) {
      res.status(404).json({ ok: false, error: 'No manifest saved for this season.' })
      return
    }
    res.json({ ok: true, manifest: rows[0].manifest })
  } catch (err) {
    sendInternalError(res, err, 'kol-program pool manifest get')
  }
})

kolProgramRouter.get('/kol-program/admin/season/:seasonId/shoutout', requireApiKey, async (req, res) => {
  try {
    const seasonId = String(req.params.seasonId)
    const out = await shoutoutForSeason(seasonId)
    res.json({
      ok: true,
      seasonId,
      seasonNumber: out.seasonNumber,
      hqHandle: CREWPAY_HQ_X_HANDLE,
      text: out.text,
      top: out.top,
    })
  } catch (err) {
    sendInternalError(res, err, 'kol-program season shoutout')
  }
})

kolProgramRouter.get('/kol-program/profile/:handle/hof-badges', async (req, res) => {
  try {
    const badges = await hofBadgesForHandle(req.params.handle)
    res.json({
      ok: true,
      badges: badges.map((b) => ({ ...b, label: hofBadgeLabel(b.seasonNumber) })),
    })
  } catch (err) {
    sendInternalError(res, err, 'kol-program hof badges')
  }
})

kolProgramRouter.post('/kol-program/admin/revoke/:xUserId', requireApiKey, async (req, res) => {
  try {
    const reason = z.string().max(280).parse(req.body?.reason || 'Revoked by admin')
    await query(
      `UPDATE kol_program_profiles SET revoked = true, flagged_reason = $2, updated_at = now() WHERE x_user_id = $1`,
      [req.params.xUserId, reason],
    )
    res.json({ ok: true })
  } catch (err) {
    sendInternalError(res, err, 'kol-program admin revoke')
  }
})
