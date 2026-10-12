import { describe, expect, it } from 'vitest'
import {
  FALLBACK_LAUNCH_VENUES,
  LAUNCH_FEE_MAP_COPY,
  explorerLabel,
  explorerTokenUrl,
  explorerTxUrl,
  inferLaunchPlatform,
  isAllowedTradeUrl,
  parseLaunchPlatform,
  platformDisplayName,
  tradeLabel,
  tradeUrl,
  unsignedLaunchCurl,
  venuesFromDiscovery,
  venuesFromOpenApi,
} from './platforms'

describe('launch platform helpers', () => {
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

  it('reads venues from discovery JSON and OpenAPI enum', () => {
    const fromDisc = venuesFromDiscovery({
      platforms: {
        default: 'pumpfun',
        venues: [
          { id: 'pumpfun', enabled: true, status: 'live', name: 'Pump.fun' },
          { id: 'bags', enabled: false, status: 'disabled', name: 'Bags.fm' },
          {
            id: 'zora',
            enabled: false,
            status: 'disabled',
            caption: 'testnet / soon',
            name: 'Zora',
          },
        ],
      },
    })
    expect(fromDisc?.map((v) => v.id)).toEqual(['pumpfun', 'bags', 'zora'])
    expect(fromDisc?.find((v) => v.id === 'bags')?.enabled).toBe(false)
    expect(fromDisc?.find((v) => v.id === 'zora')?.caption).toMatch(/testnet \/ soon/)

    const fromSpec = venuesFromOpenApi({
      components: {
        schemas: {
          LaunchRequest: { properties: { platform: { enum: ['pumpfun', 'bags', 'zora'] } } },
        },
      },
    })
    expect(fromSpec?.map((v) => v.id)).toEqual(['pumpfun', 'bags', 'zora'])
    expect(fromSpec?.find((v) => v.id === 'zora')?.enabled).toBe(false)
  })

  it('fee copy names hired KOL crew, never the launcher 60%', () => {
    expect(LAUNCH_FEE_MAP_COPY).toMatch(/hired KOL crew/)
    expect(LAUNCH_FEE_MAP_COPY.toLowerCase()).not.toMatch(/launcher gets 60/)
    expect(FALLBACK_LAUNCH_VENUES).toHaveLength(3)
    const curl = unsignedLaunchCurl({ platform: 'bags', name: 'Night Owl', ticker: 'HOOT' })
    expect(curl).toContain('"platform": "bags"')
    expect(curl).toContain('/api/agent/launch/unsigned')
  })

  it('display names match product copy', () => {
    expect(platformDisplayName('pumpfun')).toBe('Pump.fun')
    expect(platformDisplayName('bags')).toBe('Bags.fm')
    expect(platformDisplayName('zora')).toBe('Zora')
  })
})
