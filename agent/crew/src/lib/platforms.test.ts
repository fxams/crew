import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LAUNCH_PLATFORM,
  FALLBACK_LAUNCH_VENUES,
  LAUNCH_FEE_MAP_COPY,
  explorerLabel,
  explorerTokenUrl,
  explorerTxUrl,
  inferLaunchPlatform,
  isAllowedTradeUrl,
  parseLaunchPlatform,
  platformDisplayName,
  platformShortName,
  tradeLabel,
  tradeUrl,
  unsignedLaunchCurl,
  unsignedVenueHint,
  venuesFromDiscovery,
  venuesFromOpenApi,
  venuesFromPlatformsPayload,
  clankerCaption,
  clankerLaunchLabel,
  zoraCaption,
} from './platforms'

describe('launch platform helpers', () => {
  it('Clanker captions follow API chain like Zora', () => {
    expect(clankerCaption(false, 'base')).toBe('soon')
    expect(clankerCaption(true, 'base')).toBe('Base')
    expect(clankerCaption(true, 'base-sepolia')).toBe('Base Sepolia (testnet)')
    const clanker = FALLBACK_LAUNCH_VENUES.find((v) => v.id === 'clanker')
    expect(clanker?.chain).toBe('base')
    expect(clankerLaunchLabel([{ ...clanker!, enabled: true, caption: 'Base', chain: 'base' }])).toBe(
      'Clanker on Base',
    )
  })

  it('parses aliases and defaults to pumpfun', () => {
    expect(parseLaunchPlatform(undefined)).toBe('pumpfun')
    expect(parseLaunchPlatform('pump.fun')).toBe('pumpfun')
    expect(parseLaunchPlatform('bags.fm')).toBe('bags')
    expect(parseLaunchPlatform('zora-coins')).toBe('zora')
    expect(parseLaunchPlatform('raydium')).toBe('pumpfun')
  })

  it('infers from trade URL or EVM mint', () => {
    expect(inferLaunchPlatform({ pumpUrl: 'https://bags.fm/abc' })).toBe('bags')
    expect(
      inferLaunchPlatform({
        pumpUrl: 'https://zora.co/coin/base:0x1111111111111111111111111111111111111111',
      }),
    ).toBe('zora')
    expect(inferLaunchPlatform({ mint: '0x1111111111111111111111111111111111111111' })).toBe(
      'zora',
    )
    expect(inferLaunchPlatform({ pumpUrl: 'https://pump.fun/coin/x' })).toBe('pumpfun')
  })

  it('builds trade + explorer links per venue', () => {
    const mint = 'So11111111111111111111111111111111111111112'
    expect(tradeUrl('pumpfun', mint)).toContain('pump.fun/coin/')
    expect(tradeUrl('bags', mint)).toBe(`https://bags.fm/${mint}`)
    expect(tradeLabel('bags')).toBe('bags.fm')
    expect(explorerTokenUrl('bags', mint)).toContain('solscan.io/token/')
    expect(explorerLabel('zora')).toBe('Basescan')
    const zora = '0x1111111111111111111111111111111111111111'
    expect(tradeUrl('zora', zora)).toContain('zora.co/coin/')
    expect(explorerTokenUrl('zora', zora)).toContain('basescan.org/token/')
    expect(explorerTxUrl('zora', '0xabc')).toContain('basescan.org/tx/')
    expect(explorerTxUrl('pumpfun', 'sig')).toContain('solscan.io/tx/')
  })

  it('allows only known trade hosts', () => {
    expect(isAllowedTradeUrl('https://pump.fun/coin/x')).toBe(true)
    expect(isAllowedTradeUrl('https://bags.fm/x')).toBe(true)
    expect(isAllowedTradeUrl('https://zora.co/coin/base:0x1')).toBe(true)
    expect(isAllowedTradeUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedTradeUrl('https://evil.example/coin')).toBe(false)
  })

  it('reads venues from discovery JSON, /api/platforms, and OpenAPI enum', () => {
    const fromDisc = venuesFromDiscovery({
      platforms: {
        default: 'pumpfun',
        venues: [
          { id: 'pumpfun', enabled: true, status: 'live', name: 'Pump.fun', chain: 'solana' },
          { id: 'bags', enabled: false, status: 'disabled', name: 'Bags.fm', chain: 'solana' },
          {
            id: 'zora',
            enabled: false,
            status: 'disabled',
            chain: 'base-sepolia',
            name: 'Zora',
          },
        ],
      },
    })
    expect(fromDisc?.map((v) => v.id)).toEqual(['pumpfun', 'bags', 'zora', 'clanker', 'vibevibe'])
    expect(fromDisc?.find((v) => v.id === 'bags')?.enabled).toBe(false)
    expect(fromDisc?.find((v) => v.id === 'zora')?.caption).toBe('soon')
    expect(fromDisc?.find((v) => v.id === 'zora')?.chain).toBe('base-sepolia')

    const fromPayload = venuesFromPlatformsPayload({
      ok: true,
      default: 'pumpfun',
      venues: [
        { id: 'pumpfun', enabled: true, chain: 'solana' },
        { id: 'bags', enabled: true, chain: 'solana' },
        { id: 'zora', enabled: true, chain: 'base', status: 'live' },
      ],
    })
    expect(fromPayload?.find((v) => v.id === 'zora')?.enabled).toBe(true)
    expect(fromPayload?.find((v) => v.id === 'zora')?.caption).toBe('Base')
    expect(fromPayload?.find((v) => v.id === 'zora')?.chain).toBe('base')

    const sepolia = venuesFromPlatformsPayload({
      venues: [{ id: 'zora', enabled: true, chain: 'base-sepolia' }],
    })
    expect(sepolia?.find((v) => v.id === 'zora')?.caption).toBe('testnet')

    const fromSpec = venuesFromOpenApi({
      components: {
        schemas: {
          LaunchRequest: {
            properties: { platform: { enum: ['pumpfun', 'bags', 'zora', 'clanker', 'vibevibe'] } },
          },
        },
      },
    })
    expect(fromSpec?.map((v) => v.id)).toEqual(['pumpfun', 'bags', 'zora', 'clanker', 'vibevibe'])
    expect(fromSpec?.find((v) => v.id === 'zora')?.enabled).toBe(false)
    expect(fromSpec?.find((v) => v.id === 'zora')?.caption).toBe('soon')
  })

  it('fee copy names KOL crew, launching agent, and 25% treasury — never the launcher 60%', () => {
    expect(LAUNCH_FEE_MAP_COPY).toBe(
      '60% to the KOL crew, 15% to the launching agent, 25% to the treasury',
    )
    expect(LAUNCH_FEE_MAP_COPY.toLowerCase()).not.toMatch(/launcher gets 60/)
    expect(LAUNCH_FEE_MAP_COPY).not.toMatch(/rest treasury/)
    expect(FALLBACK_LAUNCH_VENUES).toHaveLength(5)
    expect(FALLBACK_LAUNCH_VENUES.find((v) => v.id === 'bags')?.caption).toBe('recommended')
    expect(DEFAULT_LAUNCH_PLATFORM).toBe('pumpfun')
    const curl = unsignedLaunchCurl({ platform: 'bags', name: 'Night Owl', ticker: 'HOOT' })
    expect(curl).toContain('"platform": "bags"')
    expect(curl).toContain('/api/agent/launch/unsigned')
    expect(curl).toContain('x-crew-api-key')
    expect(curl).toContain('YOUR_SOLANA_PUBKEY')
    expect(
      unsignedLaunchCurl({
        platform: 'zora',
        launcherPubkey: '0x1111111111111111111111111111111111111111',
      }),
    ).toContain('0x1111111111111111111111111111111111111111')
    const paid = unsignedLaunchCurl({ platform: 'bags', name: 'Night Owl', ticker: 'HOOT', auth: 'x402' })
    expect(paid).toContain('X-PAYMENT: $X402_PAYMENT')
    expect(paid.toLowerCase()).not.toContain('x-crew-api-key')
  })

  it('display names match product copy', () => {
    expect(platformDisplayName('pumpfun')).toBe('Pump.fun')
    expect(platformDisplayName('bags')).toBe('Bags.fm')
    expect(platformDisplayName('zora')).toBe('Zora')
    expect(platformShortName('pumpfun')).toBe('Pump')
    expect(platformShortName('bags')).toBe('Bags')
    expect(platformShortName('zora')).toBe('Zora')
  })

  it('Clanker unsigned hint mentions Base payout wallets', () => {
    const clanker = FALLBACK_LAUNCH_VENUES.find((v) => v.id === 'clanker')!
    expect(
      unsignedVenueHint({
        ...clanker,
        enabled: true,
        chain: 'base',
        caption: 'Base',
      }),
    ).toMatch(/Base \(0x\) payout wallet/)
  })

  it('Zora captions are Base / testnet / soon', () => {
    expect(zoraCaption(false, 'base-sepolia')).toBe('soon')
    expect(zoraCaption(true, 'base-sepolia')).toBe('testnet')
    expect(zoraCaption(true, 'base')).toBe('Base')
    expect(FALLBACK_LAUNCH_VENUES.find((v) => v.id === 'zora')?.enabled).toBe(false)
    expect(FALLBACK_LAUNCH_VENUES.find((v) => v.id === 'zora')?.caption).toBe('soon')
    expect(
      unsignedVenueHint({
        ...FALLBACK_LAUNCH_VENUES[2],
        enabled: true,
        chain: 'base',
        caption: 'Base',
      }),
    ).toMatch(/Zora on Base/)
  })
})
