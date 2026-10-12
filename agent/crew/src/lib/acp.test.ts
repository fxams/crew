import { describe, expect, it } from 'vitest'
import {
  ACP_HREF,
  FALLBACK_ACP,
  acpChipLabel,
  acpFromDoc,
  normalizeAcp,
  pickAcpRaw,
} from './acp'

const LIVE_SHAPE = {
  id: 'acp',
  name: 'Virtuals ACP',
  enabled: true,
  chain: 'base',
  chainId: 8453,
  pricesUsd: {
    crewpay_autohire_kol_crew: 0.25,
    crewpay_launch_with_crew: 1,
  },
}

describe('ACP discovery parse', () => {
  it('reads ACP from GET /api/platforms payload', () => {
    const info = acpFromDoc({ ok: true, venues: [], acp: LIVE_SHAPE })
    expect(info.enabled).toBe(true)
    expect(info.name).toBe('Virtuals ACP')
    expect(info.href).toBe(ACP_HREF)
    expect(info.chain).toBe('base')
    expect(info.chainId).toBe(8453)
    expect(info.prices).toEqual({ autohire: '$0.25', launch: '$1.00' })
  })

  it('reads nested platforms.acp from discovery', () => {
    expect(pickAcpRaw({ platforms: { acp: LIVE_SHAPE } })).toEqual(LIVE_SHAPE)
    expect(
      acpFromDoc({
        platforms: {
          acp: {
            ...LIVE_SHAPE,
            pricesUsd: { crewpay_autohire_kol_crew: 0.3, crewpay_launch_with_crew: '2' },
          },
        },
      }).prices,
    ).toEqual({ autohire: '$0.30', launch: '$2.00' })
  })

  it('falls back to Base mainnet $0.25 / $1.00 when missing', () => {
    expect(acpFromDoc(null)).toEqual(FALLBACK_ACP)
    expect(acpFromDoc({})).toEqual(FALLBACK_ACP)
    const sparse = acpFromDoc({ acp: { enabled: false, pricesUsd: {} } })
    expect(sparse.enabled).toBe(false)
    expect(sparse.prices).toEqual({ autohire: '$0.25', launch: '$1.00' })
    expect(sparse.chain).toBe('base')
    expect(sparse.href).toBe(ACP_HREF)
  })

  it('ignores junk prices and unknown hrefs stay on app.virtuals.io/acp', () => {
    const info = normalizeAcp({
      pricesUsd: { crewpay_autohire_kol_crew: 'nope', crewpay_launch_with_crew: -1 },
      chain: 'base-sepolia',
      chainId: 84532,
    })
    expect(info.prices.autohire).toBe('$0.25')
    expect(info.prices.launch).toBe('$1.00')
    expect(info.chain).toBe('base-sepolia')
    expect(info.href).toBe(ACP_HREF)
  })
})

describe('ACP chip copy', () => {
  it('names Base mainnet prices without earnings talk', () => {
    expect(acpChipLabel(FALLBACK_ACP)).toBe(
      'Virtuals ACP (Base, $0.25 autohire · $1.00 launch)',
    )
    expect(acpChipLabel(FALLBACK_ACP).toLowerCase()).not.toMatch(/earnings|you will make|guaranteed/)
  })
})
