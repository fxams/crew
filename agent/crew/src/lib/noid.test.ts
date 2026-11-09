import { describe, expect, it } from 'vitest'
import {
  NOID_KIT_CONNECT,
  NOID_KIT_HTTP,
  NOID_KIT_SITE,
  NOID_KIT_TOOLS,
  NOID_PUBLIC_NOTE,
} from './noid'

describe('noid service copy', () => {
  it('points at the hosted NOID Agent Kit and uses a placeholder key', () => {
    expect(NOID_KIT_SITE).toBe('https://noid-agent-kit.onrender.com')
    expect(NOID_KIT_HTTP).toBe('https://noid-agent-kit.onrender.com/mcp')
    expect(NOID_KIT_CONNECT).toContain(NOID_KIT_HTTP)
    expect(NOID_KIT_CONNECT).toContain('nak_YOUR_KEY')
    expect(NOID_KIT_TOOLS).toContain('create_invoice')
    expect(NOID_KIT_TOOLS).toContain('get_whale_moves')
    expect(NOID_KIT_TOOLS).toContain('create_launch_kit')
    expect(NOID_KIT_TOOLS).toHaveLength(16)
    expect(NOID_PUBLIC_NOTE).toMatch(/50-credit trial/)
    expect(NOID_PUBLIC_NOTE).toMatch(/not affiliated with, partnered with, or audited by Parano1d/i)
    expect(NOID_PUBLIC_NOTE.toLowerCase()).not.toMatch(/guaranteed|roi|income/)
    expect(NOID_PUBLIC_NOTE.toLowerCase()).not.toMatch(/official|partnership|noidpad/)
    const blob = `${NOID_KIT_CONNECT}\n${NOID_PUBLIC_NOTE}`
    expect(blob.toLowerCase()).not.toMatch(/noidpad/)
  })
})
