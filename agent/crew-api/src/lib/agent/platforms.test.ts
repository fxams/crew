import { afterEach, describe, expect, it } from 'vitest'
import {
  assertBagsEnabled,
  assertZoraEnabled,
  clankerCoinUrl,
  clankerNetwork,
  clankerReady,
  clankerRpcUrl,
  clankerTreasuryConfigured,
  suiReady,
  suiNetwork,
  vibevibeCoinUrl,
  vibevibeNetwork,
  vibevibeReady,
  vibevibeTreasuryConfigured,
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
const SUI_TREAS = '0x3333333333333333333333333333333333333333333333333333333333333333'

afterEach(() => {
  for (const key of [
    'BAGS_API_KEY',
    'ZORA_ENABLED',
    'ZORA_CHAIN',
    'ZORA_TREASURY_ADDRESS',
    'CLANKER_ENABLED',
    'CLANKER_CHAIN',
    'CLANKER_TREASURY_ADDRESS',
    'CLANKER_RPC_URL',
    'VIBEVIBE_ENABLED',
    'VIBEVIBE_CHAIN',
    'VIBEVIBE_TREASURY_ADDRESS',
    'VIBEVIBE_RPC_URL',
    'SUI_ENABLED',
    'SUI_TREASURY_ADDRESS',
    'SUI_NETWORK',
    'MEMEZ_CONFIG_KEY',
    'BASE_RPC_URL',
    'CREW_BUYBACK_WALLET_EVM',
    'ACP_ENABLED',
    'ACP_CHAIN_ID',
    'ACP_SIGNER_KEY',
    'ACP_PRICE_AUTOHIRE_USD',
    'ACP_PRICE_LAUNCH_USD',
    'X402_ENABLED',
    'X402_PAY_TO_EVM',
    'X402_PAY_TO_SOL',
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
    expect(parseLaunchPlatform('vibe')).toBe('vibevibe')
    expect(parseLaunchPlatform('memez.gg')).toBe('sui')
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

  it('defaults Clanker to Base Sepolia even when ZORA_CHAIN is base mainnet', () => {
    process.env.ZORA_CHAIN = 'base'
    delete process.env.CLANKER_CHAIN
    expect(clankerNetwork()).toBe('base-sepolia')
    process.env.CLANKER_CHAIN = 'base'
    expect(clankerNetwork()).toBe('base')
  })

  it('uses Sepolia RPC for Clanker testnet and BASE_RPC_URL only on mainnet', () => {
    delete process.env.CLANKER_CHAIN
    delete process.env.CLANKER_RPC_URL
    delete process.env.BASE_RPC_URL
    expect(clankerRpcUrl()).toBe('https://sepolia.base.org')
    process.env.BASE_RPC_URL = 'https://mainnet-custom.example'
    expect(clankerRpcUrl()).toBe('https://sepolia.base.org')
    process.env.CLANKER_CHAIN = 'base'
    expect(clankerRpcUrl()).toBe('https://mainnet-custom.example')
    process.env.CLANKER_RPC_URL = 'https://clanker-rpc.example'
    expect(clankerRpcUrl()).toBe('https://clanker-rpc.example')
  })

  it('Clanker treasury check prefers CLANKER_TREASURY_ADDRESS', () => {
    delete process.env.CLANKER_TREASURY_ADDRESS
    delete process.env.ZORA_TREASURY_ADDRESS
    delete process.env.CREW_BUYBACK_WALLET_EVM
    expect(clankerTreasuryConfigured()).toBe(false)
    process.env.CLANKER_ENABLED = '1'
    expect(clankerReady()).toBe(false)
    process.env.CLANKER_TREASURY_ADDRESS = TREAS
    expect(clankerTreasuryConfigured()).toBe(true)
    expect(clankerReady()).toBe(true)
  })

  it('Clanker coin links use basescan on Sepolia and clanker.world on mainnet', () => {
    const addr = '0x52c3f4ac350f0ddfae43a9fda7798bb6262535e9'
    expect(clankerCoinUrl(addr, 'base-sepolia')).toContain('sepolia.basescan.org')
    expect(clankerCoinUrl(addr, 'base-sepolia')).toContain('#clanker')
    expect(clankerCoinUrl(addr, 'base')).toBe(`https://clanker.world/clanker/${addr}`)
    expect(
      inferLaunchPlatformFromCoin({
        pumpUrl: clankerCoinUrl(addr, 'base-sepolia'),
        mint: addr,
      }),
    ).toBe('clanker')
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
    expect(venues.map((v) => v.id)).toEqual(['pumpfun', 'bags', 'zora', 'clanker', 'vibevibe'])
    expect(venues.find((v) => v.id === 'pumpfun')?.enabled).toBe(true)
    expect(venues.find((v) => v.id === 'pumpfun')?.chain).toBe('solana')
    expect(venues.find((v) => v.id === 'bags')?.enabled).toBe(false)
    expect(venues.find((v) => v.id === 'bags')?.caption).toBe('soon')
    expect(venues.find((v) => v.id === 'bags')?.recommended).toBe(true)
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
    expect(venues.find((v) => v.id === 'bags')?.caption).toBe('recommended')
    expect(venues.find((v) => v.id === 'bags')?.recommended).toBe(true)
    const zora = venues.find((v) => v.id === 'zora')
    expect(zora?.enabled).toBe(true)
    expect(zora?.chain).toBe('base')
    expect(zora?.status).toBe('live')
    expect(zora?.caption).toBe('Base')
    const pub = platformsPublicJson()
    expect(pub.ok).toBe(true)
    expect(pub.default).toBe('pumpfun')
    expect(pub.venues).toEqual(venues)
    expect(pub.acp.id).toBe('acp')
    expect(pub.x402).toBeTruthy()
    expect(pub.x402.enabled).toBe(false)
    expect(JSON.stringify(pub)).not.toMatch(/test-bags-key/)
  })

  it('reports ACP disabled by default and never leaks the signer key', () => {
    delete process.env.ACP_ENABLED
    delete process.env.ACP_CHAIN_ID
    process.env.ACP_SIGNER_KEY = '0xSHOULD-NEVER-APPEAR-IN-JSON'
    const pub = platformsPublicJson()
    expect(pub.acp.enabled).toBe(false)
    expect(pub.acp.id).toBe('acp')
    expect(pub.acp.chainId).toBe(84532)
    expect(pub.acp.chain).toBe('base-sepolia')
    expect(pub.acp.offerings).toEqual(['crewpay_autohire_kol_crew', 'crewpay_launch_with_crew'])
    expect(pub.acp.pricesUsd.crewpay_autohire_kol_crew).toBe(0.25)
    expect(pub.acp.pricesUsd.crewpay_launch_with_crew).toBe(1)
    expect(pub.acp.href).toBe('https://app.virtuals.io/acp')
    expect(pub.acp.feeMap).toMatch(/60% to the KOL crew/)
    expect(pub.acp.feeMap).toMatch(/25% to the treasury/)
    expect(pub.x402.enabled).toBe(false)
    expect(JSON.stringify(pub)).not.toMatch(/SHOULD-NEVER-APPEAR/)
    expect(JSON.stringify(pub)).not.toMatch(/ACP_SIGNER_KEY/)
    process.env.ACP_ENABLED = '1'
    process.env.ACP_CHAIN_ID = '8453'
    expect(platformsPublicJson().acp.enabled).toBe(true)
    expect(platformsPublicJson().acp.chain).toBe('base')
    expect(platformsPublicJson().acp.chainId).toBe(8453)
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

  it('vibevibe defaults to Robinhood testnet and treasury fallbacks', () => {
    delete process.env.VIBEVIBE_TREASURY_ADDRESS
    delete process.env.CLANKER_TREASURY_ADDRESS
    expect(vibevibeNetwork()).toBe('robinhood-testnet')
    expect(vibevibeTreasuryConfigured()).toBe(false)
    process.env.VIBEVIBE_ENABLED = '1'
    expect(vibevibeReady()).toBe(false)
    process.env.CLANKER_TREASURY_ADDRESS = TREAS
    expect(vibevibeReady()).toBe(true)
    const addr = '0x52c3f4ac350f0ddfae43a9fda7798bb6262535e9'
    expect(vibevibeCoinUrl(addr)).toContain('testnet.vibevibe.fun')
    expect(
      inferLaunchPlatformFromCoin({ pumpUrl: vibevibeCoinUrl(addr), mint: addr }),
    ).toBe('vibevibe')
  })

  it('lists sui only when SUI_ENABLED=1', () => {
    delete process.env.SUI_ENABLED
    expect(listLaunchVenues().some((v) => v.id === 'sui')).toBe(false)
    process.env.SUI_ENABLED = '1'
    const row = listLaunchVenues().find((v) => v.id === 'sui')
    expect(row?.enabled).toBe(false)
    process.env.SUI_TREASURY_ADDRESS = SUI_TREAS
    expect(suiReady()).toBe(true)
    expect(suiNetwork()).toBe('testnet')
    expect(listLaunchVenues().find((v) => v.id === 'sui')?.enabled).toBe(true)
    process.env.SUI_NETWORK = 'mainnet'
    expect(() => suiNetwork()).toThrow(/testnet-only/)
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
