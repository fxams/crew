import { describe, expect, it } from 'vitest'
import {
  assertWallet,
  getLaunchBlockers,
  isLaunchReady,
  normalizeHandle,
  normalizeOptionalTwitter,
  normalizeOptionalWebsite,
  validateDraft,
} from './validation'
import type { LaunchDraft } from './types'

function fakeImage(name = 'coin.png', type = 'image/png', size = 128): File {
  const bytes = new Uint8Array(size)
  return new File([bytes], name, { type })
}

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
  imageFile: fakeImage(),
  twitter: '',
  website: '',
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
  it('requires wallets for every crew member', () => {
    const draft: LaunchDraft = {
      ...base,
      crew: [
        { handle: '@alice', wallet: '', share: 70 },
        { handle: '@bob', wallet: '', share: 30 },
      ],
    }
    expect(() => validateDraft(draft)).toThrow(/Invalid Solana wallet/)
  })

  it('accepts a valid 100% split with wallets', () => {
    const out = validateDraft(base, {
      deskWallet: '11111111111111111111111111111111',
    })
    expect(out.ticker).toBe('DCAT')
    expect(out.shareholders).toHaveLength(2)
    expect(out.shareholders.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
  })

  it('rejects non-100% splits', () => {
    const draft: LaunchDraft = {
      ...base,
      crew: [{ handle: '@alice', wallet: base.crew[0].wallet, share: 50 }],
    }
    expect(() => validateDraft(draft)).toThrow(/total 100%/)
  })

  it('reserves desk bps for buyback mode', () => {
    const deskWallet = '11111111111111111111111111111111'
    const out = validateDraft(
      { ...base, mode: 'buyback' },
      { deskWallet },
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
      { deskWallet: '11111111111111111111111111111111' },
    )
    expect(out.shareholders.find((s) => s.role === 'desk')?.bps).toBe(2500)
  })

  it('merges desk reserve when launcher is also crew', () => {
    const launcher = base.crew[0].wallet
    const out = validateDraft(
      { ...base, mode: 'buyback' },
      { deskWallet: launcher },
    )
    const merged = out.shareholders.find((s) => s.wallet === launcher)
    expect(merged?.role).toBe('desk')
    expect(merged?.bps).toBe(2000 + 4800)
    expect(out.shareholders).toHaveLength(2)
    expect(out.shareholders.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
  })

  it('reserves 15% agent ops and requires hire roles', () => {
    const deskWallet = '11111111111111111111111111111111'
    expect(() =>
      validateDraft(
        {
          ...base,
          mode: 'agent',
          agent: {
            name: 'Desk Mind',
            objective: 'Hire KOLs who move the chart.',
            model: 'Claude Sonnet',
          },
        },
        { deskWallet },
      ),
    ).toThrow(/hire role/)

    const out = validateDraft(
      {
        ...base,
        mode: 'agent',
        agent: {
          name: 'Desk Mind',
          objective: 'Hire KOLs who move the chart.',
          model: 'Claude Sonnet',
        },
        crew: [
          { ...base.crew[0], hireRole: 'caller' },
          { ...base.crew[1], hireRole: 'kol' },
        ],
      },
      { deskWallet },
    )
    expect(out.agent?.name).toBe('Desk Mind')
    expect(out.shareholders.find((s) => s.handle === '@agent')?.bps).toBe(1500)
    expect(out.shareholders.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
  })

  it('requires a coin image', () => {
    expect(() => validateDraft({ ...base, imageFile: null })).toThrow(/image/i)
  })

  it('keeps X and website optional, normalizes when present', () => {
    const out = validateDraft(
      {
        ...base,
        twitter: '@crewdesk',
        website: 'crew.example',
      },
      { deskWallet: '11111111111111111111111111111111' },
    )
    expect(out.twitter).toBe('https://x.com/crewdesk')
    expect(out.website).toBe('https://crew.example')
  })
})

describe('optional socials', () => {
  it('normalizes twitter handles and rejects junk', () => {
    expect(normalizeOptionalTwitter('')).toBeUndefined()
    expect(normalizeOptionalTwitter('@abc')).toBe('https://x.com/abc')
    expect(() => normalizeOptionalTwitter('not a link')).toThrow(/X format/)
  })

  it('normalizes websites', () => {
    expect(normalizeOptionalWebsite('')).toBeUndefined()
    expect(normalizeOptionalWebsite('https://pump.fun')).toBe('https://pump.fun')
    expect(() => normalizeOptionalWebsite('nope')).toThrow(/Website/)
  })
})

describe('isLaunchReady', () => {
  it('blocks empty default form', () => {
    const empty: LaunchDraft = {
      name: '',
      ticker: '',
      vibe: '',
      mode: 'split',
      crew: [{ handle: '', wallet: '', share: 100 }],
      initialBuySol: 0,
      imageFile: null,
      twitter: '',
      website: '',
    }
    expect(isLaunchReady(empty)).toBe(false)
    expect(getLaunchBlockers(empty).join(' ')).toMatch(/Name|Ticker|image|handle|wallet/i)
  })

  it('passes a complete Pump-style draft', () => {
    expect(isLaunchReady(base)).toBe(true)
    expect(getLaunchBlockers(base)).toEqual([])
  })
})
