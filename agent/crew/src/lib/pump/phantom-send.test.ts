import { describe, expect, it } from 'vitest'
import { hasPhantomSignAndSend } from './phantom-send'

describe('phantom signAndSend', () => {
  it('is false without window provider', () => {
    expect(hasPhantomSignAndSend()).toBe(false)
  })
})
