import { describe, it, expect } from 'vitest'
import { runTaskAutoChecks } from './task-checks.js'

describe('task auto-checks', () => {
  it('passes keyword and minTextLength', async () => {
    const r = await runTaskAutoChecks(
      { keyword: 'banana', minTextLength: 5 },
      { urls: [], text: 'I labeled 500 images with banana tags' },
    )
    expect(r.ok).toBe(true)
  })

  it('fails xPost check without valid URL', async () => {
    const r = await runTaskAutoChecks(
      { xPost: true, requiredTicker: 'CREW' },
      { urls: ['https://example.com/nope'], text: '' },
    )
    expect(r.ok).toBe(false)
  })

  it('uses injected reachability checker', async () => {
    const r = await runTaskAutoChecks(
      { urlReachable: true, minUrls: 1 },
      { urls: ['https://crewpay.dev'] },
      { reachability: async () => true },
    )
    expect(r.ok).toBe(true)
  })
})
