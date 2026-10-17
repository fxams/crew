import { query } from '../db.js'
import { CREWPAY_HQ_X_HANDLE, kolPinnedPostId } from './flags.js'
import { loadUserAccessToken, creditProgramPointsCapped } from './store.js'
import { fetchRecentUserTweets } from './x-tweets.js'
import { verifyTaskFromTweets } from './task-verify.js'
import {
  pendingReason,
  verifyFollowingHq,
  verifyLikedTweet,
  verifyRepliedToConversation,
  verifyRepostedTweet,
} from './x-engagement.js'

type OnboardingStepDef = {
  id: OnboardingStepId
  title: string
  points: number
  order: number
  optional?: boolean
  icon: string
  hint: string
}

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    id: 'connect_x',
    title: 'Connect X',
    points: 0,
    order: 1,
    icon: '𝕏',
    hint: 'Signed in. You are on the board.',
  },
  {
    id: 'follow_hq',
    title: 'Follow @CrewPayHQ',
    points: 2000,
    order: 2,
    icon: '＋',
    hint: 'Follow @CrewPayHQ on X, then verify.',
  },
  {
    id: 'like_pinned',
    title: 'Like the pinned post',
    points: 250,
    order: 3,
    icon: '♡',
    hint: 'Like the pinned @CrewPayHQ post.',
  },
  {
    id: 'repost_pinned',
    title: 'Repost the pinned post',
    points: 500,
    order: 4,
    icon: '↻',
    hint: 'Repost the pinned @CrewPayHQ post.',
  },
  {
    id: 'reply_pinned',
    title: 'Reply and tag a friend',
    points: 1000,
    order: 5,
    icon: '💬',
    hint: 'Reply under the pinned post and tag someone.',
  },
  {
    id: 'telegram',
    title: 'Join Telegram',
    points: 500,
    order: 6,
    optional: true,
    icon: '✈',
    hint: 'Honor system — connect Telegram on your desk, or skip.',
  },
  {
    id: 'share_card',
    title: 'Share your card + ref',
    points: 1000,
    order: 7,
    icon: '▣',
    hint: 'Post your KOL card or crewpay.dev/ref/handle.',
  },
  {
    id: 'payout_wallet',
    title: 'Add a payout wallet',
    points: 500,
    order: 8,
    icon: '◎',
    hint: 'Add a Solana payout wallet on your desk.',
  },
]

export type OnboardingStepId =
  | 'connect_x'
  | 'follow_hq'
  | 'like_pinned'
  | 'repost_pinned'
  | 'reply_pinned'
  | 'engage_pinned'
  | 'share_card'
  | 'payout_wallet'
  | 'telegram'

export type StepVerifyResult =
  | { ok: true }
  | { ok: false; reason: string; pending?: boolean }

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
): Promise<{ awarded: boolean; credited: number; capped: boolean }> {
  const ins = await query(
    `INSERT INTO kol_program_onboarding_steps (x_user_id, step_id, points, completed_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (x_user_id, step_id) DO NOTHING
     RETURNING step_id`,
    [xUserId, stepId, points],
  )
  if (!ins.rows.length) return { awarded: false, credited: 0, capped: false }
  const credit = await creditProgramPointsCapped(xUserId, points, `onboarding:${stepId}`)
  return { awarded: true, credited: credit.credited, capped: credit.capped }
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

function mapStatus(
  status: 'ok' | 'pending' | 'not_found',
  notFound: string,
  action: string,
): StepVerifyResult {
  if (status === 'ok') return { ok: true }
  if (status === 'pending') return { ok: false, pending: true, reason: pendingReason(action) }
  return { ok: false, reason: notFound }
}

export async function verifyOnboardingStep(
  xUserId: string,
  handle: string,
  stepId: OnboardingStepId,
  referralUrl: string,
): Promise<StepVerifyResult> {
  const completed = await listCompletedSteps(xUserId)
  if (completed.has(stepId) || (stepId === 'engage_pinned' && completed.has('like_pinned'))) {
    return { ok: true }
  }
  if (stepId !== 'engage_pinned' && !isStepUnlocked(stepId, completed)) {
    return { ok: false, reason: 'Complete the previous step first.' }
  }

  if (stepId === 'connect_x') return { ok: true }

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
  const pinnedId = kolPinnedPostId()

  if (stepId === 'follow_hq') {
    if (!token) return { ok: false, pending: true, reason: pendingReason('follow') }
    return mapStatus(
      await verifyFollowingHq(token, xUserId),
      `Follow @${CREWPAY_HQ_X_HANDLE} on X, then verify again.`,
      'follow',
    )
  }

  if (stepId === 'like_pinned' || stepId === 'engage_pinned') {
    if (!pinnedId) return { ok: false, pending: true, reason: pendingReason('like') }
    return mapStatus(
      await verifyLikedTweet(pinnedId, xUserId, token),
      'Like the pinned @CrewPayHQ post, then verify again.',
      'like',
    )
  }

  if (stepId === 'repost_pinned') {
    if (!pinnedId) return { ok: false, pending: true, reason: pendingReason('repost') }
    return mapStatus(
      await verifyRepostedTweet(pinnedId, xUserId, token),
      'Repost the pinned @CrewPayHQ post, then verify again.',
      'repost',
    )
  }

  if (stepId === 'reply_pinned') {
    if (!token) return { ok: false, pending: true, reason: pendingReason('reply') }
    if (!pinnedId) return { ok: false, pending: true, reason: pendingReason('reply') }
    return mapStatus(
      await verifyRepliedToConversation(token, handle, pinnedId),
      'Reply under the pinned post and tag someone, then verify again.',
      'reply',
    )
  }

  if (stepId === 'share_card') {
    if (!token) return { ok: false, pending: true, reason: pendingReason('share') }
    const tweets = await fetchRecentUserTweets(token, xUserId)
    const v = verifyTaskFromTweets(
      { id: 'onboard_card', slug: 'card', task_type: 'post_card', config: {} },
      tweets,
      { handle, referralUrl },
    )
    if (v.ok) return { ok: true }
    return { ok: false, pending: true, reason: pendingReason('share') }
  }

  return { ok: false, reason: 'Unknown step.' }
}

export async function skipTelegramStep(xUserId: string): Promise<void> {
  const completed = await listCompletedSteps(xUserId)
  if (!isStepUnlocked('telegram', completed)) return
  await markStepComplete(xUserId, 'telegram', 0)
}

export async function ensureConnectXComplete(xUserId: string): Promise<Set<string>> {
  const completed = await listCompletedSteps(xUserId)
  if (!completed.has('connect_x')) {
    await markStepComplete(xUserId, 'connect_x', 0)
    completed.add('connect_x')
  }
  return completed
}
