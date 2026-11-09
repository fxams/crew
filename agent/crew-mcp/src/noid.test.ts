import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'server.ts'), 'utf8')
const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8')
const manifest = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../mcp.json'), 'utf8')

describe('crew_noid pointer', () => {
  it('registers a read-only pointer to the NOID Agent Kit', () => {
    expect(src).toContain("'crew_noid'")
    expect(src).toContain('https://noid-agent-kit.onrender.com/mcp')
    expect(src).toContain('Not affiliated with, partnered with, or audited by Parano1d')
    expect(src).toContain('never takes custody')
    expect(src).toContain('No earnings promises')
    expect(src).toContain("readOnlyHint: true")
    expect(src).toContain('/api/noid')
    expect(src).toContain('whale_moves')
    expect(src).toContain('new_tokens')
    const noidBlock = src.slice(src.indexOf("'crew_noid'"), src.indexOf("'crew_discover'"))
    expect(noidBlock.toLowerCase()).not.toMatch(/noidpad/)
    expect(noidBlock.toLowerCase()).not.toMatch(/official|partnership/)
    expect(index).toContain("'crew_noid'")
    expect(manifest).toContain('crew_noid')
  })
})
