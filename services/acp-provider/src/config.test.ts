import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig, priceForOffering } from './config.js'
import { logInfo, redact } from './log.js'

const saved = { ...process.env }

afterEach(() => {
  for (const key of [
    'ACP_ENABLED',
    'ACP_CHAIN_ID',
    'ACP_SIGNER_KEY',
    'ACP_WALLET_ADDRESS',
    'ACP_PRICE_AUTOHIRE_USD',
    'ACP_PRICE_LAUNCH_USD',
    'ACP_ENTITY_ID',
    'ACP_BUILDER_CODE',
  ]) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe('acp-provider config', () => {
  it('is a complete no-op unless ACP_ENABLED=1', () => {
    delete process.env.ACP_ENABLED
    delete process.env.ACP_SIGNER_KEY
    const cfg = loadConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.chainId).toBe(84532)
    expect(cfg.signerKey).toBe('')
    expect(cfg.priceAutohireUsd).toBe(0.02)
    expect(cfg.priceLaunchUsd).toBe(0.1)
  })

  it('reads prices and chain id without requiring a signer when disabled', () => {
    process.env.ACP_ENABLED = '0'
    process.env.ACP_CHAIN_ID = '8453'
    process.env.ACP_PRICE_AUTOHIRE_USD = '0.03'
    process.env.ACP_PRICE_LAUNCH_USD = '0.2'
    const cfg = loadConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.chainId).toBe(8453)
    expect(cfg.priceAutohireUsd).toBe(0.03)
    expect(priceForOffering(cfg, 'crewpay_launch_with_crew')).toBe(0.2)
  })

  it('never logs the signer key', () => {
    const key = '0x' + 'ab'.repeat(32)
    process.env.ACP_SIGNER_KEY = key
    const lines: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    }
    try {
      logInfo('boot', { signerKey: key, nested: { ACP_SIGNER_KEY: key } })
      expect(redact(key)).toBe('[redacted]')
      expect(lines.join('\n')).not.toContain(key)
      expect(lines.join('\n')).not.toContain('ababab')
    } finally {
      console.log = orig
    }
  })
})
