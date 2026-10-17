import { CREWPAY_HQ_X_HANDLE } from './flags.js'

export type TweetLike = {
  id: string
  text: string
  authorId?: string
  inReplyToUserId?: string
  referencedTweetIds?: string[]
}

export type TaskTemplateRow = {
  id: string
  slug: string
  task_type: string
  config: Record<string, unknown>
}

export function verifyTaskFromTweets(
  task: TaskTemplateRow,
  tweets: TweetLike[],
  ctx: { handle: string; referralUrl: string },
): { ok: true; tweetId: string } | { ok: false; reason: string } {
  const handle = ctx.handle.replace(/^@+/, '').toLowerCase()
  const refNeedle = ctx.referralUrl.toLowerCase()
  const hq = CREWPAY_HQ_X_HANDLE.toLowerCase()

  for (const t of tweets) {
    const text = (t.text || '').toLowerCase()
    switch (task.task_type) {
      case 'post_card':
        if (text.includes('crewpay.dev/ref/') || text.includes(refNeedle)) {
          return { ok: true, tweetId: t.id }
        }
        break
      case 'reply_crewpayhq':
        if (text.includes(`@${hq}`) && t.inReplyToUserId) {
          return { ok: true, tweetId: t.id }
        }
        if (text.includes(`@${hq}`) && text.includes('reply')) {
          return { ok: true, tweetId: t.id }
        }
        break
      case 'quote_launch':
        if (
          (text.includes('pump.fun') || text.includes('crewpay.dev/coin')) &&
          (t.referencedTweetIds?.length || text.includes('https://'))
        ) {
          return { ok: true, tweetId: t.id }
        }
        break
      case 'follow_crewpayhq':
        if (text.includes(`@${hq}`) && (text.includes('follow') || text.includes('following'))) {
          return { ok: true, tweetId: t.id }
        }
        break
      default:
        break
    }
  }
  return {
    ok: false,
    reason: 'No matching post found in your recent X timeline (last ~7 days). Complete the task, then tap Verify again.',
  }
}
