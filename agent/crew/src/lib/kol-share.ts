const HASHTAG = '#CrewPayKOL'

export function buildKolGrowthShareTweet(opts: {
  refLink: string
  tagHandle?: string
  replyToPostId?: string
}): string {
  const tag = opts.tagHandle?.replace(/^@+/, '').trim()
  const tagPart = tag ? `@${tag} ` : ''
  const text = `KOLs get paid from memecoin creator fees, not promises. Here's my CrewPay card, what's yours? Tagging ${tagPart}${HASHTAG} ${opts.refLink}`
  const params = new URLSearchParams({ text })
  if (opts.replyToPostId?.trim()) {
    params.set('in_reply_to', opts.replyToPostId.trim())
  }
  return `https://x.com/intent/post?${params.toString()}`
}
