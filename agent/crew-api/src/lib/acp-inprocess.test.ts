import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acpInProcessEnabled,
  findAcpProviderEntry,
  maybeStartAcpInProcess,
  setAcpProviderLoaderForTests,
} from './acp-inprocess.js'

const saved = {
  ACP_ENABLED: process.env.ACP_ENABLED,
  ACP_INPROCESS: process.env.ACP_INPROCESS,
}

afterEach(() => {
  if (saved.ACP_ENABLED === undefined) delete process.env.ACP_ENABLED
  else process.env.ACP_ENABLED = saved.ACP_ENABLED
  if (saved.ACP_INPROCESS === undefined) delete process.env.ACP_INPROCESS
  else process.env.ACP_INPROCESS = saved.ACP_INPROCESS
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

  it('finds the repo acp-provider entry', () => {
    const entry = findAcpProviderEntry()
    expect(entry).toMatch(/services\/acp-provider\/(src\/index\.ts|dist\/index\.js)$/)
  })
})
