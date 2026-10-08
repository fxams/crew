import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig, resolvePublicMode } from './client.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolvePublicMode', () => {
  it('honors explicit override', () => {
    expect(resolvePublicMode(true)).toBe(true)
    expect(resolvePublicMode(false)).toBe(false)
  })

  it('defaults stdio / unset to private', () => {
    vi.stubEnv('CREW_MCP_PUBLIC', '')
    expect(resolvePublicMode()).toBe(false)
  })

  it('respects CREW_MCP_PUBLIC=0', () => {
    vi.stubEnv('CREW_MCP_PUBLIC', '0')
    expect(resolvePublicMode()).toBe(false)
  })

  it('respects CREW_MCP_PUBLIC=1', () => {
    vi.stubEnv('CREW_MCP_PUBLIC', '1')
    expect(resolvePublicMode()).toBe(true)
  })
})

describe('loadConfig publicMode', () => {
  it('ignores shared env API key in public mode', () => {
    vi.stubEnv('CREW_MCP_PUBLIC', '1')
    vi.stubEnv('CREW_AGENT_API_KEY', 'shared-secret')
    vi.stubEnv('CREW_LAUNCHER_KEY', 'launcher-secret')
    const cfg = loadConfig()
    expect(cfg.publicMode).toBe(true)
    expect(cfg.apiKey).toBe('')
    expect(cfg.launcherKey).toBe('')
  })
})
