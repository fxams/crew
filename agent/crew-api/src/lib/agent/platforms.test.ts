import { afterEach, describe, expect, it } from 'vitest'
import {
  assertBagsEnabled,
  assertZoraEnabled,
  parseLaunchPlatform,
  zoraChainId,
  zoraEnabled,
  zoraNetwork,
} from './platforms.js'

const saved = { ...process.env }

afterEach(() => {
  process.env.BAGS_API_KEY = saved.BAGS_API_KEY
  process.env.ZORA_ENABLED = saved.ZORA_ENABLED
  process.env.ZORA_CHAIN = saved.ZORA_CHAIN
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

  it('disables Zora unless ZORA_ENABLED is set', () => {
    delete process.env.ZORA_ENABLED
    expect(zoraEnabled()).toBe(false)
    expect(() => assertZoraEnabled()).toThrow(/ZORA_ENABLED/)
    process.env.ZORA_ENABLED = '1'
    expect(zoraEnabled()).toBe(true)
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
})
