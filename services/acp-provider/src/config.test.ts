import { afterEach, describe, expect, it } from 'vitest'
import { assertReadyToConnect, loadConfig, priceForOffering } from './config.js'
import { logInfo, redact } from './log.js'

const PRIVY_P256 =
  'wallet-auth:MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgTESTPRIVYKEYDONOTUSE'
const WALLET = '0x1111111111111111111111111111111111111111'

const saved = { ...process.env }

afterEach(() => {
  for (const key of [
    'ACP_ENABLED',
    'ACP_CHAIN_ID',
    'ACP_SIGNER_KEY',
    'ACP_WALLET_ADDRESS',
    'ACP_WALLET_ID',
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
    expect(cfg.walletAddress).toBe('')
    expect(cfg.priceAutohireUsd).toBe(0.25)
    expect(cfg.priceLaunchUsd).toBe(1)
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

  it('accepts a Privy P-256 authorization key as given (not 32-byte hex)', () => {
    process.env.ACP_ENABLED = '1'
    process.env.ACP_SIGNER_KEY = `  ${PRIVY_P256}  `
    process.env.ACP_WALLET_ADDRESS = WALLET
    process.env.ACP_WALLET_ID = 'wallet-id-1'
    const cfg = loadConfig()
    expect(cfg.enabled).toBe(true)
    expect(cfg.signerKey).toBe(PRIVY_P256)
    expect(cfg.walletAddress).toBe(WALLET)
    expect(cfg.walletId).toBe('wallet-id-1')
    expect(() => assertReadyToConnect(cfg)).not.toThrow()
  })

  it('does not derive ACP_WALLET_ADDRESS from the signer key', () => {
    process.env.ACP_ENABLED = '1'
    process.env.ACP_SIGNER_KEY = PRIVY_P256
    delete process.env.ACP_WALLET_ADDRESS
    delete process.env.ACP_WALLET_ID
    const cfg = loadConfig()
    expect(cfg.signerKey).toBe(PRIVY_P256)
    expect(cfg.walletAddress).toBe('')
    expect(cfg.walletId).toBe('')
    expect(() => assertReadyToConnect(cfg)).toThrow(/ACP_WALLET_ADDRESS/)
  })

  it('requires ACP_WALLET_ID explicitly when connecting', () => {
    process.env.ACP_ENABLED = '1'
    process.env.ACP_SIGNER_KEY = PRIVY_P256
    process.env.ACP_WALLET_ADDRESS = WALLET
    delete process.env.ACP_WALLET_ID
    expect(() => assertReadyToConnect(loadConfig())).toThrow(/ACP_WALLET_ID/)
  })

  it('never logs the Privy signer key', () => {
    process.env.ACP_SIGNER_KEY = PRIVY_P256
    const lines: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    }
    try {
      logInfo('boot', { signerKey: PRIVY_P256, nested: { ACP_SIGNER_KEY: PRIVY_P256 } })
      expect(redact(PRIVY_P256)).toBe('[redacted]')
      expect(lines.join('\n')).not.toContain(PRIVY_P256)
      expect(lines.join('\n')).not.toContain('TESTPRIVYKEY')
    } finally {
      console.log = orig
    }
  })
})
