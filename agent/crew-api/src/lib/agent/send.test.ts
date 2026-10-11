import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveOpsPayer } from './send.js'

describe('resolveOpsPayer', () => {
  const saved = {
    CREW_OPS_KEY: process.env.CREW_OPS_KEY,
    CREW_BUYBACK_PRIVATE_KEY: process.env.CREW_BUYBACK_PRIVATE_KEY,
  }
  beforeEach(() => {
    delete process.env.CREW_OPS_KEY
    delete process.env.CREW_BUYBACK_PRIVATE_KEY
  })
  afterEach(() => {
    if (saved.CREW_OPS_KEY) process.env.CREW_OPS_KEY = saved.CREW_OPS_KEY
    else delete process.env.CREW_OPS_KEY
    if (saved.CREW_BUYBACK_PRIVATE_KEY)
      process.env.CREW_BUYBACK_PRIVATE_KEY = saved.CREW_BUYBACK_PRIVATE_KEY
    else delete process.env.CREW_BUYBACK_PRIVATE_KEY
  })
  it('does not fall back to CREW_BUYBACK_PRIVATE_KEY', () => {
    process.env.CREW_BUYBACK_PRIVATE_KEY = 'not-a-key'
    expect(() => resolveOpsPayer()).toThrow()
  })
})

