import { describe, expect, it } from 'vitest'
import { isStepUnlocked, nextUnlockableStep } from './onboarding.js'

describe('kol onboarding unlock order', () => {
  it('starts at connect_x then follow_hq', () => {
    expect(nextUnlockableStep(new Set())).toBe('connect_x')
    expect(nextUnlockableStep(new Set(['connect_x']))).toBe('follow_hq')
  })

  it('requires follow before later steps', () => {
    const done = new Set(['connect_x', 'follow_hq', 'like_pinned', 'repost_pinned', 'reply_pinned'])
    expect(isStepUnlocked('share_card', done)).toBe(true)
    expect(isStepUnlocked('share_card', new Set(['like_pinned']))).toBe(false)
  })
})
