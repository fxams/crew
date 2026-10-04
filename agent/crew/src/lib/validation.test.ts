import { describe, expect, it } from 'vitest'
import { validateDraft, normalizeHandle, assertWallet } from './validation'
import type { LaunchDraft } from './types'

const base: LaunchDraft = {
  name: 'Desk Cat',
  ticker: 'DCAT',
  vibe: 'tips the tape',
  mode: 'split',
  crew: [
    {
      handle: '@alice',
      wallet: '11111111111111111111111111111112',
      share: 60,
    },
    {
      handle: '@bob',
      wallet: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      share: 40,
    },
  ],
  initialBuySol: 0.1,
}

describe('normalizeHandle', () => {
  it('adds @ and lowercases', () => {
    expect(normalizeHandle('Alice_X')).toBe('@alice_x')
  })

  it('rejects bad handles', () => {
    expect(() => normalizeHandle('no spaces')).toThrow(/Invalid X handle/)
  })
})

describe('assertWallet', () => {
  it('accepts a valid pubkey', () => {
    expect(assertWallet('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')).toMatch(
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    )
  })

  it('rejects garbage', () => {
    expect(() => assertWallet('not-a-key')).toThrow(/Invalid Solana wallet/)
  })
})

describe('validateDraft', () => {
  it('accepts a 100% split without wallets in demo mode', () => {
    const draft: LaunchDraft = {
      ...base,
      crew: [
        { handle: '@alice', wallet: '', share: 70 },
        { handle: '@bob', wallet: '', share: 30 },
      ],
    }
    const out = validateDraft(draft, { requireWallets: false })
    expect(out.ticker).toBe('DCAT')
    expect(out.shareholders).toHaveLength(2)
    expect(out.shareholders.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
  })

  it('requires wallets on mainnet', () => {
    const draft: LaunchDraft = {
      ...base,
      crew: [
        { handle: '@alice', wallet: '', share: 70 },
        { handle: '@bob', wallet: '', share: 30 },
      ],
    }
    expect(() => validateDraft(draft, { requireWallets: true })).toThrow(/Invalid Solana wallet/)
  })

  it('rejects non-100% splits', () => {
    const draft: LaunchDraft = {
      ...base,
      crew: [{ handle: '@alice', wallet: '', share: 50 }],
    }
    expect(() => validateDraft(draft, { requireWallets: false })).toThrow(/total 100%/)
  })

  it('reserves desk bps for buyback mode', () => {
    const deskWallet = '11111111111111111111111111111111'
    const out = validateDraft(
      { ...base, mode: 'buyback' },
      {
        requireWallets: true,
        deskWallet,
      },
    )
    const desk = out.shareholders.find((s) => s.role === 'desk')
    expect(desk?.wallet).toBe(deskWallet)
    expect(desk?.bps).toBe(2000)
    expect(out.shareholders).toHaveLength(3)
    expect(out.shareholders.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
  })

  it('reserves 25% for raid mode', () => {
    const out = validateDraft(
      { ...base, mode: 'raid' },
      {
        requireWallets: true,
        deskWallet: '11111111111111111111111111111111',
      },
    )
    expect(out.shareholders.find((s) => s.role === 'desk')?.bps).toBe(2500)
  })

  it('merges desk reserve when launcher is also crew', () => {
    const launcher = base.crew[0].wallet
    const out = validateDraft(
      { ...base, mode: 'buyback' },
      { requireWallets: true, deskWallet: launcher },
    )
    const merged = out.shareholders.find((s) => s.wallet === launcher)
    expect(merged?.role).toBe('desk')
    expect(merged?.bps).toBe(2000 + 4800) // 20% desk + 60% of remaining 80%
    expect(out.shareholders).toHaveLength(2)
    expect(out.shareholders.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
  })
})
