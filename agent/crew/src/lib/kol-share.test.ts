import { describe, expect, it } from 'vitest'
import { buildKolGrowthShareTweet } from './kol-share'

describe('buildKolGrowthShareTweet', () => {
  it('includes hashtag, ref link, and optional tag', () => {
    const url = buildKolGrowthShareTweet({
      refLink: 'https://crewpay.dev/ref/alice',
      tagHandle: 'bob',
    })
    expect(url).toContain('x.com/intent/post')
    expect(decodeURIComponent(url)).toContain('#CrewPayKOL')
    expect(decodeURIComponent(url)).toContain('@bob')
    expect(decodeURIComponent(url)).toContain('https://crewpay.dev/ref/alice')
  })

  it('sets in_reply_to when replying under pinned post', () => {
    const url = buildKolGrowthShareTweet({
      refLink: 'https://crewpay.dev/ref/alice',
      replyToPostId: '1234567890',
    })
    expect(url).toContain('in_reply_to=1234567890')
  })
})
