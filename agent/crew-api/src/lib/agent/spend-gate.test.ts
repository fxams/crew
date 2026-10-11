import { describe, expect, it } from 'vitest'
import { assertMaySetRequireApproval, resolveSpendGate } from './spend-gate.js'

describe('spend-gate', () => {
  it('accepts launch with no dryRunId on a default (requireApproval=false) key', () => {
    expect(resolveSpendGate({ requireApproval: false, dryRunId: null })).toBe('skip')
    expect(resolveSpendGate({ requireApproval: false, dryRunId: '' })).toBe('skip')
  })

  it('rejects launch with no dryRunId on a requireApproval key', () => {
    expect(() => resolveSpendGate({ requireApproval: true, dryRunId: null })).toThrow(
      /dryRunId required/,
    )
  })

  it('consumes when dryRunId is present (approval optional or required)', () => {
    expect(resolveSpendGate({ requireApproval: false, dryRunId: 'a'.repeat(32) })).toBe('consume')
    expect(resolveSpendGate({ requireApproval: true, dryRunId: 'a'.repeat(32) })).toBe('consume')
  })

  it('rejects the agent key trying to turn requireApproval off', () => {
    expect(() =>
      assertMaySetRequireApproval({ next: false, viaAgentApiKey: true }),
    ).toThrow(/cannot turn requireApproval off/)
    expect(() =>
      assertMaySetRequireApproval({ next: true, viaAgentApiKey: true }),
    ).not.toThrow()
    expect(() =>
      assertMaySetRequireApproval({ next: false, viaAgentApiKey: false }),
    ).not.toThrow()
  })
})
