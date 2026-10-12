import { describe, expect, it, vi } from 'vitest'

vi.mock('../agent-referral.js', () => ({
  getAgentKeyReferral: vi.fn(async () => null),
  getAgentReferralByOwnerWallet: vi.fn(async () => null),
}))

import { runAutohire } from './autohire-run.js'

describe('runAutohire (x402 / ACP path)', () => {
  it('returns a crew list and records the paying wallet as identity', async () => {
    const result = await runAutohire({
      name: 'Night Owl',
      ticker: 'HOOT',
      description: 'An owl that only trades after midnight.',
      seats: 3,
      payerWallet: '0x1111111111111111111111111111111111111111',
    })
    expect(result.ok).toBe(true)
    expect(result.crew.length).toBeGreaterThan(0)
    expect(result.identity).toBe('0x1111111111111111111111111111111111111111')
    expect(result.feeMap).toMatch(/hired KOL crew/)
    expect(result.disclaimer.toLowerCase()).toMatch(/not opt-in|not consent|listing/)
  })

  it('rejects an empty brief', async () => {
    await expect(runAutohire({})).rejects.toThrow(/name, ticker, description, or mint/)
  })
})
