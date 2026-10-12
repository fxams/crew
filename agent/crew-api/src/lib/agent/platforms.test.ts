import { afterEach, describe, expect, it } from 'vitest'
import {
  assertBagsEnabled,
  assertZoraEnabled,
  inferLaunchPlatformFromCoin,
  listLaunchVenues,
  parseLaunchPlatform,
  platformsPublicJson,
  zoraChainId,
  zoraEnabled,
  zoraNetwork,
  zoraReady,
} from './platforms.js'

const saved = { ...process.env }
const TREAS = '0x1111111111111111111111111111111111111111'

afterEach(() => {
  for (const key of [
    'BAGS_API_KEY',
    'ZORA_ENABLED',
    'ZORA_CHAIN',
    'ZORA_TREASURY_ADDRESS',
    'CREW_BUYBACK_WALLET_EVM',
  ] as const) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe('launch platforms', () => {
  it('defaults and aliases', () => {
    expect(parseLaunchPlatform(undefined)).toBe('pumpfun')
    expect(parseLaunchPlatform('pump.fun')).toBe('pumpfun')
    expect(parseLaunchPlatform('bags.fm')).toBe('bags')
    expect(parseLaunchPlatform('zora-coins')).toBe('zora')
    expect(() => parseLaunchPlatform('raydium')).toThrow(/Unknown launch platform/)
  })

  it('disables Bags without BAGS_API_KEY', () => {
    delete process.env.BAGS_API_KEY
    expect(() => assertBagsEnabled()).toThrow(/BAGS_API_KEY/)
    expect(() => assertBagsEnabled()).toThrow(/disabled/)
  })

  it('disables Zora unless ZORA_ENABLED and a treasury address are set', () => {
    delete process.env.ZORA_ENABLED
    delete process.env.ZORA_TREASURY_ADDRESS
    delete process.env.CREW_BUYBACK_WALLET_EVM
    expect(zoraEnabled()).toBe(false)
    expect(zoraReady()).toBe(false)
    expect(() => assertZoraEnabled()).toThrow(/ZORA_ENABLED/)
    process.env.ZORA_ENABLED = '1'
    expect(zoraEnabled()).toBe(true)
    expect(zoraReady()).toBe(false)
    expect(() => assertZoraEnabled()).toThrow(/TREASURY|0x/)
    process.env.ZORA_TREASURY_ADDRESS = TREAS
    expect(zoraReady()).toBe(true)
    assertZoraEnabled()
  })

  it('defaults Zora to Base Sepolia and allows mainnet via config', () => {
    delete process.env.ZORA_CHAIN
    expect(zoraNetwork()).toBe('base-sepolia')
    expect(zoraChainId()).toBe(84532)
    process.env.ZORA_CHAIN = 'base'
    expect(zoraNetwork()).toBe('base')
    expect(zoraChainId()).toBe(8453)
  })

  it('lists venues with enabled flags, chain, and no secrets', () => {
    delete process.env.BAGS_API_KEY
    delete process.env.ZORA_ENABLED
    delete process.env.ZORA_TREASURY_ADDRESS
    delete process.env.CREW_BUYBACK_WALLET_EVM
    delete process.env.ZORA_CHAIN
    const venues = listLaunchVenues()
    expect(venues.map((v) => v.id)).toEqual(['pumpfun', 'bags', 'zora'])
    expect(venues.find((v) => v.id === 'pumpfun')?.enabled).toBe(true)
    expect(venues.find((v) => v.id === 'pumpfun')?.chain).toBe('solana')
    expect(venues.find((v) => v.id === 'bags')?.enabled).toBe(false)
    expect(venues.find((v) => v.id === 'bags')?.caption).toBe('soon')
    const zora = venues.find((v) => v.id === 'zora')
    expect(zora?.enabled).toBe(false)
    expect(zora?.chain).toBe('base-sepolia')
    expect(zora?.caption).toBe('soon')
    expect(JSON.stringify(venues)).not.toMatch(/sk-|BAGS_API_KEY=/)
    expect(JSON.stringify(venues)).not.toMatch(/0x1111/)
  })

  it('enables Bags with BAGS_API_KEY and Zora on Base when ready', () => {
    process.env.BAGS_API_KEY = 'test-bags-key'
    process.env.ZORA_ENABLED = '1'
    process.env.ZORA_TREASURY_ADDRESS = TREAS
    process.env.ZORA_CHAIN = 'base'
    const venues = listLaunchVenues()
    expect(venues.find((v) => v.id === 'bags')?.enabled).toBe(true)
    expect(venues.find((v) => v.id === 'bags')?.caption).toBeUndefined()
    const zora = venues.find((v) => v.id === 'zora')
    expect(zora?.enabled).toBe(true)
    expect(zora?.chain).toBe('base')
    expect(zora?.status).toBe('live')
    expect(zora?.caption).toBe('Base')
    const pub = platformsPublicJson()
    expect(pub.ok).toBe(true)
    expect(pub.default).toBe('pumpfun')
    expect(pub.venues).toEqual(venues)
    expect(JSON.stringify(pub)).not.toMatch(/test-bags-key/)
  })

  it('captions Zora as testnet on Base Sepolia when enabled', () => {
    process.env.ZORA_ENABLED = '1'
    process.env.ZORA_TREASURY_ADDRESS = TREAS
    delete process.env.ZORA_CHAIN
    const zora = listLaunchVenues().find((v) => v.id === 'zora')
    expect(zora?.enabled).toBe(true)
    expect(zora?.chain).toBe('base-sepolia')
    expect(zora?.status).toBe('testnet')
    expect(zora?.caption).toBe('testnet')
  })

  it('infers platform from trade URL or EVM mint', () => {
    expect(inferLaunchPlatformFromCoin({ pumpUrl: 'https://bags.fm/abc' })).toBe('bags')
    expect(
      inferLaunchPlatformFromCoin({
        pumpUrl: 'https://zora.co/coin/base:0x1111111111111111111111111111111111111111',
      }),
    ).toBe('zora')
    expect(
      inferLaunchPlatformFromCoin({ mint: '0x1111111111111111111111111111111111111111' }),
    ).toBe('zora')
    expect(inferLaunchPlatformFromCoin({ pumpUrl: 'https://pump.fun/coin/x' })).toBe('pumpfun')
  })
})
