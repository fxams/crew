import { describe, expect, it } from 'vitest'
import { verifyTaskFromTweets } from './task-verify.js'

describe('verifyTaskFromTweets', () => {
  it('detects card post', () => {
    const r = verifyTaskFromTweets(
      { id: 't1', slug: 'post-card', task_type: 'post_card', config: {} },
      [{ id: '1', text: 'Join me https://crewpay.dev/ref/alice' }],
      { handle: 'alice', referralUrl: 'https://crewpay.dev/ref/alice' },
    )
    expect(r.ok).toBe(true)
  })
})
