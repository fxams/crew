import { describe, expect, it } from 'vitest'
import { detectNarratives, planNarrativeHires, KOL_DB } from './narrative.js'
import { buildCrewShareholders, normalizeCrew } from './shareholders.js'

const SOL_WALLET = 'So11111111111111111111111111111111111111112'
const EVM_WALLET = '0x2222222222222222222222222222222222222222'

describe('agent narrative autohire', () => {
  it('loads kol db', () => {
    expect(KOL_DB.length).toBeGreaterThanOrEqual(1500)
  })

  it('plans a 5-pack with wallets totaling 100%', () => {
    const plan = planNarrativeHires(
      { name: 'Pepe AI', ticker: 'PEPEAI', vibe: 'meme degen frog agent' },
      { limit: 5 },
    )
    expect(plan.hires.length).toBe(5)
    expect(plan.crew.reduce((s, c) => s + c.share, 0)).toBe(100)
    expect(plan.crew.every((c) => c.wallet.length >= 32)).toBe(true)
    expect(plan.match.tags.length).toBeGreaterThan(0)
  })

  it('detects ai ticker', () => {
    const m = detectNarratives({ name: 'Mind', ticker: 'AGENT', vibe: '' })
    expect(m.tags[0]).toBe('ai')
  })

  it('demotes known-bad X @oxrxbt out of hire #1 (CP-3)', () => {
    const plan = planNarrativeHires(
      { name: 'Viral Cat', ticker: 'CAT', vibe: 'a trench meme about a viral cat' },
      { limit: 5 },
    )
    expect(plan.hires.length).toBe(5)
    const top = plan.hires[0]!
    const topX = (top.kol.x || '').toLowerCase().replace(/^@/, '')
    expect(topX).not.toBe('oxrxbt')
    expect(top.kol.pump.toLowerCase()).not.toBe('oxr')
    const oxr = plan.hires.find(
      (h) =>
        (h.kol.x || '').toLowerCase().replace(/^@/, '') === 'oxrxbt' ||
        h.kol.pump.toLowerCase() === 'oxr',
    )
    if (oxr) {
      expect(oxr.reasons.some((r) => /unverified\/weak X/i.test(r))).toBe(true)
      expect(oxr.hireRank).toBeGreaterThan(1)
    }
  })

  it('prefers registered crew wallet when handle matches', () => {
    const baseline = planNarrativeHires(
      { name: 'Meme Coin', ticker: 'MEME', vibe: 'funny viral meme degen' },
      { limit: 5 },
    )
    expect(baseline.hires.length).toBeGreaterThan(0)
    // Register a mid-pack hire so preference + wallet swap are visible.
    const seed = baseline.hires[Math.min(2, baseline.hires.length - 1)]!.kol
    const handle = (seed.x || seed.pump).replace(/^@+/, '').toLowerCase()
    const regWallet = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    const plan = planNarrativeHires(
      { name: 'Meme Coin', ticker: 'MEME', vibe: 'funny viral meme degen' },
      {
        limit: 5,
        registered: [{ handle, wallet: regWallet }],
      },
    )
    const hit = plan.hires.find((h) =>
      h.reasons.some((r) => /registered crew/i.test(r)),
    )
    expect(hit).toBeTruthy()
    expect(hit!.kol.wallet).toBe(regWallet)
    expect(hit!.hireRank).toBe(1)
  })

  it('telegram-only unverified registered KOLs rank below X-registered ones', () => {
    const prev = process.env.AUTOHIRE_REGISTERED_FIRST
    process.env.AUTOHIRE_REGISTERED_FIRST = 'true'
    try {
      const plan = planNarrativeHires(
        { name: 'Agent Frog', ticker: 'FROG', vibe: 'ai trench meme' },
        {
          limit: 2,
          onlyRegistered: true,
          registered: [
            {
              handle: 'x_primary',
              wallet: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
              followers: 10,
            },
            {
              handle: 'tg_only_zz',
              wallet: 'So11111111111111111111111111111111111111112',
              followers: 10,
              tgOnlyUnverified: true,
            },
          ],
        },
      )
      expect(plan.hires.length).toBe(2)
      expect(plan.hires[0]!.kol.pump.toLowerCase()).toBe('x_primary')
      expect(plan.hires[1]!.reasons.some((r) => /telegram-only/i.test(r))).toBe(true)
    } finally {
      process.env.AUTOHIRE_REGISTERED_FIRST = prev
    }
  })

  it('ranks registered crew by KOL season points when program priority is on', () => {
    const prevReg = process.env.AUTOHIRE_REGISTERED_FIRST
    const prevKol = process.env.KOL_PROGRAM_ENABLED
    process.env.AUTOHIRE_REGISTERED_FIRST = 'true'
    process.env.KOL_PROGRAM_ENABLED = '1'
    try {
      const plan = planNarrativeHires(
        { name: 'Meme', ticker: 'MEME', vibe: 'meme degen' },
        {
          limit: 2,
          onlyRegistered: true,
          kolProgramPriority: true,
          registered: [
            {
              handle: 'low_pts',
              wallet: 'So11111111111111111111111111111111111111112',
              kolSeasonPoints: 12,
              kolCrewPriority: true,
            },
            {
              handle: 'high_pts',
              wallet: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
              kolSeasonPoints: 400,
              kolCrewPriority: true,
              kolFounderNumber: 2,
            },
          ],
        },
      )
      expect(plan.hires.length).toBe(2)
      expect(plan.hires[0]!.kol.pump.toLowerCase()).toBe('high_pts')
    } finally {
      process.env.AUTOHIRE_REGISTERED_FIRST = prevReg
      process.env.KOL_PROGRAM_ENABLED = prevKol
    }
  })

  it('registered not in kol-db gets picked (registered-first)', () => {
    const prev = process.env.AUTOHIRE_REGISTERED_FIRST
    process.env.AUTOHIRE_REGISTERED_FIRST = 'true'
    try {
      const handle = 'newacct_zz'
      const regWallet = 'So11111111111111111111111111111111111111112'
      const plan = planNarrativeHires(
        { name: 'Agent Frog', ticker: 'FROG', vibe: 'ai trench meme' },
        { limit: 3, registered: [{ handle, wallet: regWallet, followers: 123 }] },
      )
      expect(plan.hires.length).toBeGreaterThan(0)
      expect(plan.policy).toBe('registered-first')
      const top = plan.hires[0]!
      expect(top.kol.wallet).toBe(regWallet)
      expect(top.kol.pump.toLowerCase()).toBe(handle)
      expect(top.hireRank).toBe(1)
    } finally {
      process.env.AUTOHIRE_REGISTERED_FIRST = prev
    }
  })

  it('with 3 registered and 5 seats, registered take seats 1–3', () => {
    const prev = process.env.AUTOHIRE_REGISTERED_FIRST
    process.env.AUTOHIRE_REGISTERED_FIRST = 'true'
    try {
      const regs = Array.from({ length: 3 }).map((_, i) => ({
        handle: `reguser_${i + 1}`,
        wallet:
          i === 0
            ? 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
            : `So1111111111111111111111111111111111111111${i}`,
        followers: 100 + i * 10,
      }))
      const plan = planNarrativeHires(
        { name: 'Meme Pack', ticker: 'MEME', vibe: 'degen meme trench' },
        { limit: 5, registered: regs },
      )
      expect(plan.hires.length).toBe(5)
      expect(plan.policy).toBe('registered-first')
      for (let i = 0; i < 3; i += 1) {
        expect(plan.hires[i]!.reasons.some((r) => /registered crew/i.test(r))).toBe(true)
      }
    } finally {
      process.env.AUTOHIRE_REGISTERED_FIRST = prev
    }
  })

  it('with 7 registered and 5 seats, all 5 seats are registered', () => {
    const prev = process.env.AUTOHIRE_REGISTERED_FIRST
    process.env.AUTOHIRE_REGISTERED_FIRST = 'true'
    try {
      const regs = Array.from({ length: 7 }).map((_, i) => ({
        handle: `bulkreg_${i + 1}`,
        wallet: `1111111111111111111111111111111111111111${(i + 3) % 9}`,
        followers: 50 + i,
      }))
      const plan = planNarrativeHires(
        { name: 'Agent Coin', ticker: 'AGT', vibe: 'ai agent' },
        { limit: 5, registered: regs },
      )
      expect(plan.hires.length).toBe(5)
      expect(plan.policy).toBe('registered-first')
      expect(plan.hires.every((h) => h.reasons.some((r) => /registered crew/i.test(r)))).toBe(true)
    } finally {
      process.env.AUTOHIRE_REGISTERED_FIRST = prev
    }
  })

  it('with the flag off, current behaviour holds (no synthetic registered)', () => {
    const prev = process.env.AUTOHIRE_REGISTERED_FIRST
    process.env.AUTOHIRE_REGISTERED_FIRST = 'false'
    try {
      const handle = 'ghost_reg_user'
      const regWallet = 'SysvarRent111111111111111111111111111111111'
      const plan = planNarrativeHires(
        { name: 'CT Meme', ticker: 'CT', vibe: 'meme culture' },
        { limit: 5, registered: [{ handle, wallet: regWallet }] },
      )
      expect(plan.policy).toBe('score')
      const found = plan.hires.find(
        (h) => h.kol.wallet === regWallet || h.kol.pump.toLowerCase() === handle,
      )
      expect(found).toBeFalsy()
    } finally {
      process.env.AUTOHIRE_REGISTERED_FIRST = prev
    }
  })

  it('verified telegram channel reach is a capped boost; unverified and stale are zero', () => {
    const prev = process.env.AUTOHIRE_REGISTERED_FIRST
    process.env.AUTOHIRE_REGISTERED_FIRST = 'true'
    try {
      const walletA = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
      const walletB = 'So11111111111111111111111111111111111111112'
      const walletC = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
      const common = { followers: 10 }
      const verified = planNarrativeHires(
        { name: 'Agent Frog', ticker: 'FROG', vibe: 'ai trench meme' },
        {
          limit: 3,
          onlyRegistered: true,
          registered: [
            { handle: 'x_plain', wallet: walletA, ...common },
            {
              handle: 'x_verified_tg',
              wallet: walletB,
              ...common,
              tgChannelVerified: true,
              tgReach: 80_000,
              tgChannelVerifiedAt: new Date().toISOString(),
            },
            {
              handle: 'x_unverified_tg',
              wallet: walletC,
              ...common,
              tgChannelVerified: false,
              tgReach: 9_999_999,
            },
          ],
        },
      )
      expect(verified.hires[0]!.kol.pump.toLowerCase()).toBe('x_verified_tg')
      expect(verified.hires[0]!.reasons.some((r) => /tgReach/i.test(r))).toBe(true)
      const unverified = verified.hires.find((h) => h.kol.pump.toLowerCase() === 'x_unverified_tg')
      expect(unverified).toBeTruthy()
      expect(unverified!.reasons.some((r) => /tgReach/i.test(r))).toBe(false)
      expect(verified.hires[0]!.score).toBeGreaterThan(
        verified.hires.find((h) => h.kol.pump.toLowerCase() === 'x_plain')!.score,
      )

      const stale = planNarrativeHires(
        { name: 'Agent Frog', ticker: 'FROG', vibe: 'ai trench meme' },
        {
          limit: 2,
          onlyRegistered: true,
          registered: [
            { handle: 'x_plain', wallet: walletA, ...common },
            {
              handle: 'x_stale_tg',
              wallet: walletB,
              ...common,
              tgChannelVerified: true,
              tgReach: 80_000,
              tgChannelVerifiedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
            },
          ],
        },
      )
      expect(stale.hires.find((h) => h.kol.pump.toLowerCase() === 'x_stale_tg')!.reasons.some((r) => /tgReach/i.test(r))).toBe(
        false,
      )
    } finally {
      process.env.AUTOHIRE_REGISTERED_FIRST = prev
    }
  })

  it('no duplicate wallets across picks', () => {
    const prev = process.env.AUTOHIRE_REGISTERED_FIRST
    process.env.AUTOHIRE_REGISTERED_FIRST = 'true'
    try {
      const dupWallet = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
      const regs = [
        { handle: 'dup_a', wallet: dupWallet },
        { handle: 'dup_b', wallet: dupWallet },
      ]
      const plan = planNarrativeHires(
        { name: 'Trench Dog', ticker: 'DOG', vibe: 'trench degen' },
        { limit: 2, registered: regs },
      )
      expect(plan.hires.length).toBe(2)
      const wallets = plan.hires.map((h) => h.kol.wallet)
      const uniq = new Set(wallets)
      expect(uniq.size).toBe(wallets.length)
    } finally {
      process.env.AUTOHIRE_REGISTERED_FIRST = prev
    }
  })
})

describe('shareholders', () => {
  it('builds 10000 bps with platform cut', () => {
    const platform = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
    const desk = 'SysvarRent111111111111111111111111111111111'
    const crew = normalizeCrew(
      [
        { handle: '@a', wallet: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', share: 60, hireRole: 'kol' },
        { handle: '@b', wallet: 'So11111111111111111111111111111111111111112', share: 40, hireRole: 'caller' },
      ],
      'agent',
    )
    const shares = buildCrewShareholders(crew, 'agent', {
      deskWallet: desk,
      platformWallet: platform,
    })
    expect(shares.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
    expect(shares.find((s) => s.wallet === platform)?.bps).toBe(2500)
    expect(shares.find((s) => s.wallet === desk)?.bps).toBe(1500)
  })

  it('agent-key referral is 5% of total fees from treasury (not a KOL seat carve)', () => {
    const platform = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
    const desk = 'SysvarRent111111111111111111111111111111111'
    const kolWallet = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    const referrerWallet = 'So11111111111111111111111111111111111111112'
    const crew = normalizeCrew(
      [{ handle: '@alice', wallet: kolWallet, share: 100, hireRole: 'kol' }],
      'agent',
    )
    const shares = buildCrewShareholders(crew, 'agent', {
      deskWallet: desk,
      platformWallet: platform,
      agentReferrer: { wallet: referrerWallet, handle: '@bob', code: 'bob' },
    })
    expect(shares.find((s) => s.role === 'agent-referral')?.bps).toBe(500)
    expect(shares.find((s) => s.wallet === kolWallet)?.bps).toBe(6000)
    expect(shares.find((s) => s.wallet === platform)?.bps).toBe(2000)
    expect(shares.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
  })
})

describe('planNarrativeHires requireEvmPayout', () => {
  const INPUT = { name: 'Pepe AI', ticker: 'PEPEAI', vibe: 'meme degen frog agent' }

  it('skips Solana-only registered KOLs and hires those with evm_wallet', () => {
    const plan = planNarrativeHires(INPUT, {
      limit: 3,
      onlyRegistered: true,
      requireEvmPayout: true,
      registered: [
        { handle: 'blknoiz06', wallet: SOL_WALLET, followers: 500_000 },
        { handle: 'evmcrewtest99', wallet: SOL_WALLET, evmWallet: EVM_WALLET, followers: 5_000 },
      ],
    })
    expect(plan.crew.length).toBeGreaterThan(0)
    expect(plan.crew.every((c) => c.wallet.startsWith('0x'))).toBe(true)
    expect(plan.crew.some((c) => c.handle.toLowerCase().includes('blknoiz'))).toBe(false)
    expect(plan.crew.some((c) => c.handle.toLowerCase().includes('evmcrewtest99'))).toBe(true)
  })

  it('returns no crew when no registered KOL has evm_wallet', () => {
    const plan = planNarrativeHires(INPUT, {
      limit: 3,
      onlyRegistered: true,
      requireEvmPayout: true,
      registered: [{ handle: 'blknoiz06', wallet: SOL_WALLET, followers: 500_000 }],
    })
    expect(plan.crew).toEqual([])
  })
})
