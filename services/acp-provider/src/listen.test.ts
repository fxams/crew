import { afterEach, describe, expect, it, vi } from 'vitest'
import { startAcpListener } from './listen.js'

const saved = { ...process.env }

afterEach(() => {
  for (const key of ['ACP_ENABLED', 'ACP_SIGNER_KEY', 'ACP_WALLET_ID']) {
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
})
