import { describe, expect, it } from 'vitest'
import { isStepUnlocked, nextUnlockableStep } from './onboarding.js'

describe('kol onboarding unlock order', () => {
  it('starts at follow_hq', () => {
    expect(nextUnlockableStep(new Set())).toBe('follow_hq')
  })

  it('requires follow before share_card', () => {
    const done = new Set(['follow_hq', 'engage_pinned'])
    expect(isStepUnlocked('share_card', done)).toBe(true)
    expect(isStepUnlocked('share_card', new Set(['engage_pinned']))).toBe(false)
  })
})
