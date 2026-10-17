import { query } from '../db.js'
import { CREWPAY_HQ_X_HANDLE, kolPinnedPostId } from './flags.js'
import { loadUserAccessToken, creditProgramPoints } from './store.js'
import { fetchRecentUserTweets } from './x-tweets.js'
import { verifyTaskFromTweets } from './task-verify.js'

export const ONBOARDING_STEPS = [
  { id: 'follow_hq', title: 'Follow @CrewPayHQ', points: 25, order: 1 },
  { id: 'engage_pinned', title: 'Like or repost the pinned post', points: 30, order: 2 },
  { id: 'share_card', title: 'Post your card (or reply under pinned)', points: 40, order: 3 },
  { id: 'payout_wallet', title: 'Add a payout wallet', points: 35, order: 4 },
  { id: 'telegram', title: 'Connect Telegram (optional)', points: 15, order: 5, optional: true },
] as const

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]['id']

export async function listCompletedSteps(xUserId: string): Promise<Set<string>> {
  const { rows } = await query<{ step_id: string }>(
    `SELECT step_id FROM kol_program_onboarding_steps WHERE x_user_id = $1`,
    [xUserId],
  )
  return new Set(rows.map((r) => r.step_id))
}

export async function markStepComplete(
  xUserId: string,
  stepId: string,
  points: number,
): Promise<boolean> {
  const ins = await query(
    `INSERT INTO kol_program_onboarding_steps (x_user_id, step_id, points, completed_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (x_user_id, step_id) DO NOTHING
     RETURNING step_id`,
    [xUserId, stepId, points],
  )
  if (!ins.rows.length) return false
  await creditProgramPoints(xUserId, points, `onboarding:${stepId}`)
  return true
}

export function nextUnlockableStep(completed: Set<string>): OnboardingStepId | null {
  for (const s of ONBOARDING_STEPS) {
    if (!s.optional && !completed.has(s.id)) return s.id
  }
  if (!completed.has('telegram')) return 'telegram'
  return null
}

export function isStepUnlocked(stepId: OnboardingStepId, completed: Set<string>): boolean {
  const step = ONBOARDING_STEPS.find((s) => s.id === stepId)
  if (!step) return false
  for (const s of ONBOARDING_STEPS) {
    if (s.order >= step.order) break
    if (s.optional) continue
    if (!completed.has(s.id)) return false
  }
  return true
}

export async function verifyOnboardingStep(
  xUserId: string,
  handle: string,
  stepId: OnboardingStepId,
  referralUrl: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const completed = await listCompletedSteps(xUserId)
  if (completed.has(stepId)) return { ok: true }
  if (!isStepUnlocked(stepId, completed)) {
    return { ok: false, reason: 'Complete the previous step first.' }
  }

  if (stepId === 'payout_wallet') {
    const { rows } = await query<{ wallet: string }>(
      `SELECT wallet FROM kol_registrations WHERE x_user_id = $1`,
      [xUserId],
    )
    const w = rows[0]?.wallet?.trim()
    if (!w || w.length < 32) {
      return { ok: false, reason: 'Add a Solana payout wallet on your desk first.' }
    }
    return { ok: true }
  }

  if (stepId === 'telegram') {
    const { rows } = await query<{ telegram_username: string | null }>(
      `SELECT telegram_username FROM kol_registrations WHERE x_user_id = $1`,
      [xUserId],
    )
    if (!rows[0]?.telegram_username) {
      return { ok: false, reason: 'Connect Telegram on your desk, or skip this step.' }
    }
    return { ok: true }
  }

  const token = await loadUserAccessToken(xUserId)
  if (!token) {
    return { ok: false, reason: 'X session expired — sign in again from /kol.' }
  }
  const tweets = await fetchRecentUserTweets(token, xUserId)
  const hq = CREWPAY_HQ_X_HANDLE.toLowerCase()
  const pinnedId = kolPinnedPostId()

  if (stepId === 'follow_hq') {
    const v = verifyTaskFromTweets(
      { id: 'onboard_follow', slug: 'follow', task_type: 'follow_crewpayhq', config: {} },
      tweets,
      { handle, referralUrl },
    )
    return v.ok ? { ok: true } : { ok: false, reason: v.reason }
  }

  if (stepId === 'engage_pinned') {
    const pinnedNeedle = pinnedId.toLowerCase()
    for (const t of tweets) {
      const text = (t.text || '').toLowerCase()
      if (pinnedId && (t.referencedTweetIds?.includes(pinnedId) || text.includes(pinnedNeedle))) {
        if (text.includes('like') || text.includes('repost') || text.includes('rt ') || text.includes('🔁')) {
          return { ok: true }
        }
      }
      if (text.includes(`@${hq}`) && (text.includes('repost') || text.includes('like') || text.includes('❤'))) {
        return { ok: true }
      }
    }
    return {
      ok: false,
      reason: 'Like or repost the pinned @CrewPayHQ post, then verify again.',
    }
  }

  if (stepId === 'share_card') {
    if (pinnedId) {
      for (const t of tweets) {
        const text = (t.text || '').toLowerCase()
        if (
          (text.includes('crewpay.dev') || text.includes(referralUrl.toLowerCase())) &&
          (t.inReplyToUserId || t.referencedTweetIds?.includes(pinnedId))
        ) {
          return { ok: true }
        }
      }
    }
    const v = verifyTaskFromTweets(
      { id: 'onboard_card', slug: 'card', task_type: 'post_card', config: {} },
      tweets,
      { handle, referralUrl },
    )
    return v.ok ? { ok: true } : { ok: false, reason: v.reason }
  }

  return { ok: false, reason: 'Unknown step.' }
}

export async function skipTelegramStep(xUserId: string): Promise<void> {
  const completed = await listCompletedSteps(xUserId)
  if (!isStepUnlocked('telegram', completed)) return
  await markStepComplete(xUserId, 'telegram', 0)
}
