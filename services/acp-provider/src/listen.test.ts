import { afterEach, describe, expect, it, vi } from 'vitest'
import { startAcpListener } from './listen.js'

const PRIVY_P256 =
  'wallet-auth:MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgTESTPRIVYKEYDONOTUSE'

const saved = { ...process.env }

afterEach(() => {
  for (const key of [
    'ACP_ENABLED',
    'ACP_SIGNER_KEY',
    'ACP_WALLET_ADDRESS',
    'ACP_WALLET_ID',
    'ACP_CHAIN_ID',
  ]) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe('startAcpListener', () => {
  it('is a no-op unless ACP_ENABLED=1 (does not connect or exit)', async () => {
    delete process.env.ACP_ENABLED
    delete process.env.ACP_SIGNER_KEY
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    try {
      const handle = await startAcpListener()
      expect(handle.started).toBe(false)
      await handle.stop()
      expect(exit).not.toHaveBeenCalled()
    } finally {
      exit.mockRestore()
    }
  })

  it('swallows config errors (Privy key without wallet address) and does not throw', async () => {
    process.env.ACP_ENABLED = '1'
    process.env.ACP_SIGNER_KEY = PRIVY_P256
    delete process.env.ACP_WALLET_ADDRESS
    delete process.env.ACP_WALLET_ID
    const errors: string[] = []
    const orig = console.error
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    }
    try {
      const handle = await startAcpListener()
      expect(handle.started).toBe(false)
      expect(errors.join('\n')).toMatch(/startup failed|ACP_WALLET_ADDRESS/)
      expect(errors.join('\n')).not.toContain(PRIVY_P256)
    } finally {
      console.error = orig
    }
  })

  it('swallows loadConfig errors so callers never see a throw', async () => {
    process.env.ACP_ENABLED = '1'
    process.env.ACP_SIGNER_KEY = PRIVY_P256
    process.env.ACP_WALLET_ADDRESS = 'not-an-address'
    process.env.ACP_WALLET_ID = 'wallet-id-1'
    await expect(startAcpListener()).resolves.toEqual({
      started: false,
      stop: expect.any(Function),
    })
  })
})
