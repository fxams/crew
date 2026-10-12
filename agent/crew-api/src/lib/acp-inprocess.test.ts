import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acpInProcessEnabled,
  findAcpProviderEntry,
  maybeStartAcpInProcess,
  setAcpProviderLoaderForTests,
} from './acp-inprocess.js'

const PRIVY_P256 =
  'wallet-auth:MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgTESTPRIVYKEYDONOTUSE'

const saved = {
  ACP_ENABLED: process.env.ACP_ENABLED,
  ACP_INPROCESS: process.env.ACP_INPROCESS,
  ACP_SIGNER_KEY: process.env.ACP_SIGNER_KEY,
  ACP_WALLET_ADDRESS: process.env.ACP_WALLET_ADDRESS,
  ACP_WALLET_ID: process.env.ACP_WALLET_ID,
}

afterEach(() => {
  for (const key of ['ACP_ENABLED', 'ACP_INPROCESS', 'ACP_SIGNER_KEY', 'ACP_WALLET_ADDRESS', 'ACP_WALLET_ID'] as const) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  setAcpProviderLoaderForTests(null)
})

describe('ACP_INPROCESS', () => {
  it('is off by default', () => {
    delete process.env.ACP_INPROCESS
    expect(acpInProcessEnabled()).toBe(false)
  })

  it('does not load the provider when the flag is off', async () => {
    delete process.env.ACP_INPROCESS
    delete process.env.ACP_ENABLED
    const load = vi.fn()
    setAcpProviderLoaderForTests(load)
    const handle = await maybeStartAcpInProcess()
    expect(handle.started).toBe(false)
    expect(load).not.toHaveBeenCalled()
  })

  it('is a no-op when ACP_INPROCESS=1 but ACP_ENABLED is off', async () => {
    process.env.ACP_INPROCESS = '1'
    delete process.env.ACP_ENABLED
    const load = vi.fn()
    setAcpProviderLoaderForTests(load)
    const handle = await maybeStartAcpInProcess()
    expect(handle.started).toBe(false)
    expect(load).not.toHaveBeenCalled()
  })

  it('starts the listener in-process when both flags are on', async () => {
    process.env.ACP_INPROCESS = '1'
    process.env.ACP_ENABLED = '1'
    const stop = vi.fn(async () => {})
    const startAcpListener = vi.fn(async () => ({ started: true, stop }))
    setAcpProviderLoaderForTests(async () => ({ startAcpListener }))
    const handle = await maybeStartAcpInProcess()
    expect(handle.started).toBe(true)
    expect(startAcpListener).toHaveBeenCalledTimes(1)
    const opts = startAcpListener.mock.calls[0][0]
    expect(typeof opts?.runAutohire).toBe('function')
    expect(typeof opts?.runUnsignedLaunch).toBe('function')
    await handle.stop()
    expect(stop).toHaveBeenCalled()
  })

  it('keeps the API up if the provider fails to load', async () => {
    process.env.ACP_INPROCESS = '1'
    process.env.ACP_ENABLED = '1'
    setAcpProviderLoaderForTests(async () => {
      throw new Error('sdk missing')
    })
    const handle = await maybeStartAcpInProcess()
    expect(handle.started).toBe(false)
  })

  it('keeps the API up if startAcpListener throws a config error', async () => {
    process.env.ACP_INPROCESS = '1'
    process.env.ACP_ENABLED = '1'
    setAcpProviderLoaderForTests(async () => ({
      startAcpListener: async () => {
        throw new Error('ACP_WALLET_ADDRESS is required when ACP_ENABLED=1')
      },
    }))
    await expect(maybeStartAcpInProcess()).resolves.toEqual({
      started: false,
      stop: expect.any(Function),
    })
  })

  it('does not crash HTTP when the real listener gets a Privy key without wallet address', async () => {
    process.env.ACP_INPROCESS = '1'
    process.env.ACP_ENABLED = '1'
    process.env.ACP_SIGNER_KEY = PRIVY_P256
    delete process.env.ACP_WALLET_ADDRESS
    delete process.env.ACP_WALLET_ID
    const handle = await maybeStartAcpInProcess()
    expect(handle.started).toBe(false)
  })

  it('finds the repo acp-provider entry', () => {
    const entry = findAcpProviderEntry()
    expect(entry).toMatch(/services\/acp-provider\/(src\/index\.ts|dist\/index\.js)$/)
  })
})
