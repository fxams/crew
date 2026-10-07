import { describe, expect, it } from 'vitest'
import { proposeHolderKolShares, type HolderRow } from './holder-kol'
import { KOL_DB } from './kol-directory'

const PLATFORM = 'So11111111111111111111111111111111111111112'

describe('proposeHolderKolShares', () => {
  it('allocates crew pool bps by balance among matched KOLs', () => {
    const a = KOL_DB[0]
    const b = KOL_DB[1]
    expect(a.wallet).toBeTruthy()
    expect(b.wallet).toBeTruthy()

    const holders: HolderRow[] = [
      {
        tokenAccount: 'ata1',
        owner: a.wallet,
        amount: '600',
        uiAmount: 600,
      },
      {
        tokenAccount: 'ata2',
        owner: b.wallet,
        amount: '400',
        uiAmount: 400,
      },
      {
        tokenAccount: 'ata3',
        owner: 'SomeRandomWallet1111111111111111111111111',
        amount: '9999',
        uiAmount: 9999,
      },
    ]

    const out = proposeHolderKolShares({
      holders,
      mode: 'split',
      platformWallet: PLATFORM,
      vaultOwners: new Set(),
    })

    expect(out.matches).toHaveLength(2)
    expect(out.platformBps).toBe(2500)
    expect(out.shareholders.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
    expect(out.crew.reduce((s, r) => s + r.share, 0)).toBe(100)
    const top = out.matches[0]
    expect(top.wallet).toBe(a.wallet)
    // 60% of 7500 crew pool after 25% platform
    expect(top.bps).toBe(4500)
  })

  it('reserves desk bps and caps kol slots under Pump max 10', () => {
    const holders: HolderRow[] = KOL_DB.slice(0, 12).map((k, i) => ({
      tokenAccount: `ata_${i}`,
      owner: k.wallet,
      amount: String(1000 - i),
      uiAmount: 1000 - i,
    }))

    const desk = '11111111111111111111111111111111'
    const out = proposeHolderKolShares({
      holders,
      mode: 'buyback',
      deskWallet: desk,
      platformWallet: PLATFORM,
      vaultOwners: new Set(),
    })

    expect(out.deskBps).toBe(2000)
    expect(out.platformBps).toBe(2500)
    expect(out.matches.length).toBeLessThanOrEqual(8)
    expect(out.shareholders.length).toBeLessThanOrEqual(10)
    expect(out.shareholders.reduce((s, r) => s + r.bps, 0)).toBe(10_000)
    expect(out.shareholders.some((s) => s.wallet === desk && s.role === 'desk')).toBe(true)
    expect(out.shareholders.some((s) => s.role === 'platform')).toBe(true)
  })

  it('excludes vault owners from matches', () => {
    const a = KOL_DB[0]
    const vault = 'BondingCurveVault11111111111111111111111'
    const out = proposeHolderKolShares({
      holders: [
        { tokenAccount: 'v', owner: vault, amount: '1e12', uiAmount: 1e12 },
        { tokenAccount: 'k', owner: a.wallet, amount: '10', uiAmount: 10 },
      ],
      mode: 'split',
      platformWallet: PLATFORM,
      vaultOwners: new Set([vault]),
    })
    expect(out.excludedVaults).toBe(1)
    expect(out.matches).toHaveLength(1)
    expect(out.matches[0].wallet).toBe(a.wallet)
  })
})
