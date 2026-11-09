import { describe, expect, it } from 'vitest'
import {
  CREATIVE_MCP_CONNECT,
  CREATIVE_MCP_HTTP,
  CREATIVE_MCP_SITE,
  CREATIVE_MCP_TOOLS,
  CREATIVE_PUBLIC_NOTE,
} from './creative'

describe('creative service copy', () => {
  it('points at the hosted creative-mcp and uses a placeholder key', () => {
    expect(CREATIVE_MCP_SITE).toBe('https://creative-mcp-40dj.onrender.com')
    expect(CREATIVE_MCP_HTTP).toBe('https://creative-mcp-40dj.onrender.com/mcp')
    expect(CREATIVE_MCP_CONNECT).toContain(CREATIVE_MCP_HTTP)
    expect(CREATIVE_MCP_CONNECT).toContain('lk_YOUR_KEY')
    expect(CREATIVE_MCP_TOOLS).toContain('generate_image')
    expect(CREATIVE_PUBLIC_NOTE).toMatch(/50-credit trial/)
    expect(CREATIVE_PUBLIC_NOTE.toLowerCase()).not.toMatch(/guaranteed|roi|income/)
    const blob = `${CREATIVE_MCP_CONNECT}\n${CREATIVE_PUBLIC_NOTE}`
    expect(blob.toLowerCase()).not.toMatch(/qatar|asia\/qatar|\+03:00|deepcounterfeit/)
  })
})
